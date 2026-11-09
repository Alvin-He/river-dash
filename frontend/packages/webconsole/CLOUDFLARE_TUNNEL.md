# Optional remote viewing with Cloudflare Quick Tunnel

The Rust backend and local operator dashboard operate independently of
Cloudflare. Remote viewing is **disabled by default** and can be switched on
or off from the local **Viewer management** menu. Only temporary links are supported; permanent custom domains and
named tunnel tokens are not configured.

## Host PC: how to use it

1. Start the Rust backend on the hosting PC.
2. In `frontend/`, run `npm install` if dependencies are missing, then start
   the operator dashboard:

   ```powershell
   npm run dev --workspace=@river-dash/webconsole
   ```

3. Visit **http://127.0.0.1:5173** on the host PC (never on another device).
4. Open **Viewer management** and create viewer credentials, if needed.
5. Click **Enable** under Remote viewing. River Dash then:
   - Locates a local cloudflared executable, or on Windows x64 downloads a
     pinned binary from Cloudflare's official GitHub release and verifies SHA256.
   - Builds a **separate** viewer-only frontend under `.viewer-dist/`.
   - Starts a loopback-only viewer server on **127.0.0.1:4174**.
   - Starts `cloudflared` in the background, connected **only** to that server.
   - Displays the temporary HTTPS URL when the connector registers.
6. Click **Copy link** and send the URL and the viewer's credentials to your
   chosen viewer. Only the host PC needs cloudflared.

Quick Tunnels require no Cloudflare account, domain, port forwarding, or
separate Cloudflare terminal window.

### What if cloudflared can't download?

Copy your existing official `cloudflared-windows-amd64.exe` into
`river-dash/tools/cloudflared.exe`, then click **Disable** and **Enable** to retry.
Alternatively set `RIVER_DASH_CLOUDFLARED_PATH` to an existing executable path
before launching Vite. Non-Windows hosts use an installed `cloudflared` on PATH
or provide `tools/cloudflared`.

The built-in first-use Windows download is pinned to **cloudflared 2026.10.7**
from Cloudflare's official GitHub release, and checks its SHA-256 digest before
executing it.
No third-party binary is included in the distributed source ZIP. The downloaded
binary is cached locally under `.river-dash-state/bin/` (excluded from Git).
Review updates to the pinned version/hash manually in `cloudflaredBinary.ts`.

## Operator-first behavior

- Viewer account creation and remote-viewing activation are independent.
- Remote access is off on first run. The operator's enable/disable preference
  is stored in `.river-dash-state/remote-viewing.json` and restored when the
  frontend host restarts. Clear that file to reset to off.
- Disabling remote access stops both managed child processes, removes the
  link, and **does not** stop the operator dashboard or Rust backend.
- If building, downloading, or connecting fails, Viewer management shows an
  error. **The operator still has local access.** Disable and re-enable to retry.
- The public URL changes whenever you start a new Quick Tunnel. It stops
  working when Cloudflare exits or the hosting PC is off.
- The viewer endpoint always assigns `viewer`, even for requests made from
  127.0.0.1 through cloudflared. It only proxies login/logout and authenticated
  read-only configuration requests. Operator-only account creation, writes,
  and management endpoints never reach the Rust backend via this gateway.
- A public tunnel does **not** synchronize browsers' mock stand telemetry:
  each viewer still sees locally generated demo data.
- The frontend manager is part of the Vite **development/preview host**. A
  static-only deployment cannot start an executable or provide management APIs;
  a future deployment needs a compatible server-side host.

## Security and deployment notes

- Keep the Rust backend's **port 3000 inaccessible** to viewers. Its HTTP
  interface includes configuration and account-write endpoints. The frontend's viewer proxy does not protect
  users who can connect directly to port 3000.
- Keep the Cloudflare endpoint pointed ONLY to the viewer port **4174**.
  Do not expose the operator port 5173 or backend port 3000.
- The management API (`/api/remote-access`) is available only from the local
  operator address, with same-origin request checks; viewer requests are denied.
- Quick Tunnels are for development/testing and have no uptime guarantee.
  They currently **do not support Server-Sent Events**, so future synchronized
  live data would need a supported transport or deployment method.
- Only enable a public link when you're ready for viewers to sign in. Anyone
  with the link can reach the login page and static dashboard assets.
- Do not put a Cloudflare tunnel token or passwords in browser code. This
  Quick Tunnels use no account token, so River Dash stores none.
- For a production service, revisit authentication, CSRF, session storage,
  backend binding, and more reliable tunnel deployment.

## Troubleshooting

- **Error about cloudflared:** check downloads/GitHub access or place the
  official Windows executable in `tools/cloudflared.exe`.
- **Build failure:** run `npm install` from `frontend/` and check the displayed
  error. The viewer bundle rebuilds on every enable; the operator build is
  untouched.
- **Viewer port occupied:** stop any manually launched `preview:tunnel` on 4174.
- **No link:** check internet access and use Disable/Enable to retry.
- **Viewer gets 401:** create a viewer account in the local operator menu and
  sign in using that account. Viewer sessions are per running gateway process.
- **Cloudflare 502:** the viewer-only server was not reachable; inspect status
  in Viewer management. Don't change the tunnel target to port 5173.
- **Changed mock state isn't shared:** expected, separate pending improvement.

Cloudflare docs: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
Binary downloads: https://github.com/cloudflare/cloudflared/releases
Cloudflare open-source license: https://github.com/cloudflare/cloudflared/blob/master/LICENSE
