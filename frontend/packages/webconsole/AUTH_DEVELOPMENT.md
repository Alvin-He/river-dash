# Frontend authentication and access modes

The Vite host provides a role-aware gateway to the Rust/Axum backend.
The connection entry point determines the browser's access role:

| Entry point | Host binding | Role | Intended use |
|---|---|---|---|
| Normal Vite dev: `npm run dev --workspace=@river-dash/webconsole` | `0.0.0.0:5173` | Local loopback browser = operator; other TCP peers = viewer | Operator UI / optional LAN viewers |
| Built viewer preview: `npm run preview:tunnel --workspace=@river-dash/webconsole` | `127.0.0.1:4174` | **Every request = viewer**, even loopback | Cloudflare Tunnel public URL |

The built viewer preview requires a viewer-mode build. Normally the tunnel
manager performs that build and starts preview automatically when the local
operator enables remote viewing. To start it manually for testing, run
`npm run build --workspace=@river-dash/webconsole -- --mode tunnel-viewer` from
`frontend/` first. For details, see [CLOUDFLARE_TUNNEL.md](./CLOUDFLARE_TUNNEL.md).

## Gateway behavior

- `GET /api/client-role` reports the role selected by the server, not by a
  browser-supplied header, URL, or environment variable.
- The local operator may create viewer accounts through `POST /api/setup` using
  the existing backend route. Viewer clients cannot invoke it.
- Viewer API routing allows `POST /api/login`, `POST /api/logout`, and
  authenticated `GET`/`HEAD` `/api/configs` and `/api/configs/{name}` only.
  Other API requests receive HTTP 403 before reaching Rust.
- A successful viewer `POST /api/login` returns a cookie. The frontend stores
  only its SHA-256 digest in memory; the proxy watches the upstream `/login`
  path after Vite's `/api` rewrite. Logout clears the tracked session. Browser
  refresh works; restart of the viewer frontend requires reauthentication.
- The backend sets a cookie with `SameSite=None` and no `Secure` flag. The
  frontend normalizes it to `SameSite=Lax; HttpOnly`; **HTTPS tunnel mode**
  also marks it `Secure`.
- The tunnel listener is unconditionally viewer-only, regardless of the
  connection's actual TCP peer. As additional misconfiguration protection,
  the normal listener downgrades requests with Cloudflare headers or a
  non-local `Host` to viewer access, but these checks are not a substitute for
  using the dedicated tunnel listener.

## Important limits

Do **not** publish port `3000` or proxy it directly. The Rust backend
accepts configuration writes and account creation through `/setup`. Its
loopback authentication exception means the frontend proxy must reject viewer
writes. Restrict direct access to the backend port with the host firewall.

Only the viewer-only *built preview* accepts arbitrary public Host headers
(required because Quick Tunnel hostnames are random). **Do not** point a
Cloudflare Tunnel at the operator/dev frontend port, which exposes development
source and local operator capabilities.

The stand remains a browser-local mock. Cloudflare connectivity does not
synchronize simulated telemetry, mode changes, valves, or logs between browsers.

This is small-team demonstration access, not a hardened production gateway.
Before exposing real stand controls, add server-side RBAC and enforce it in
Rust, rather than relying on a frontend proxy.

## Testing

From `frontend/`:

```powershell
npm run test:lan-access --workspace=@river-dash/webconsole
npm run build --workspace=@river-dash/webconsole
```

The gateway test suite verifies Cloudflare loopback downgrades, viewer-only
writes blocked, sign-in cookie handling after proxy URL rewrite, secure tunnel
cookies, session revocation, and the original LAN path.
