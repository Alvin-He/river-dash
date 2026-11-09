# River Dash webconsole

React, TypeScript, Vite, and `react-rnd` frontend for the NILE test-stand
engineering dashboard.

## Start one frontend for operator and viewers

Start the Rust backend on port `3000`. Then run from `frontend/`:

```sh
npm install
npm run dev --workspace=@river-dash/webconsole
```

- On the host computer, open `http://127.0.0.1:5173` to use the **operator**
  dashboard. Open **Viewer management** from the floating menu (`Shift+M`) to create login credentials in the backend.
- On another device on the LAN, open `http://<host-LAN-IP>:5173`. This
  automatically shows the **viewer** sign-in screen without a separate
  viewer-mode startup command.
- A built frontend can be served the same way with
  `npm run build --workspace=@river-dash/webconsole` followed by
  `npm run preview --workspace=@river-dash/webconsole` (port `4173`).

The normal dev and preview servers can accept LAN connections and proxy API
requests to `127.0.0.1:3000`. The frontend gateway allows viewer sign-in and
read-only configuration requests while rejecting viewer writes. **Keep port 3000 private**:
the backend itself still exposes configuration write routes. See
[authentication and deployment](AUTH_DEVELOPMENT.md) for details and caveats.

## Optional temporary public link

The local operator can enable a managed Cloudflare Quick Tunnel in **Viewer
management**. It starts a separate viewer-only preview on loopback port `4174`
and shows a temporary HTTPS link. This feature is disabled by default and does
not affect local operation if Cloudflare is unavailable. See
[Quick Tunnel setup](CLOUDFLARE_TUNNEL.md).

## Development checks

```sh
npm run build --workspace=@river-dash/webconsole
npm run lint --workspace=@river-dash/webconsole
```

## Current dashboard

`src/components/DashboardCanvas/DashboardCanvas.tsx` registers the visible
modules. Geometry, snapping, and resize constraints live in
`src/layout/dashboardLayout.ts`; `src/layout/useDashboardLayout.ts` manages
interactions and persistence.

- [Adding modules](src/modules/README.md)
- [Shared component contracts](src/components/README.md)
- [Layout behavior](src/layout/README.md)

The dashboard fills the browser viewport and adapts module positions and sizes
to narrower windows. Telemetry and graphs use demonstration streams. The
operator has mock mode/valve controls, a stand simulator, and an in-memory event
log; the P&ID module is a placeholder. A small, always-visible status badge identifies simulation/no-hardware mode and the current operating mode; it does not reserve dashboard height. Viewer
browsers do not share the operator's simulated state.

### Fullscreen

On `/dashboard`, use **Full screen** in the floating menu (`Shift+M`) to request fullscreen mode.
Use **Exit full screen** or **Esc** to return to the windowed view. Fullscreen
changes the available viewport but does not reset the saved layout.

### Floating menu and access roles

The former 48px top bar is removed. The menu icon floats over the dashboard
near the upper-right corner and does not affect module geometry. Use `Shift+M`
to toggle its dropdown; `Escape` or an outside click closes it. The dropdown
has independent toggles for icon visibility and click availability; `Shift+M`
works regardless. Preferences intentionally reset after refresh so the menu
is recoverable. Text-entry fields do not trigger the shortcut.

Operators can lock/edit the dashboard, reset its arrangement when unlocked,
and open Viewer management (including remote-view controls). Viewers cannot
access these actions, but can enter fullscreen and sign out. Access to actual
backend operations remains enforced by the existing gateway/backend checks;
menu visibility alone is not an authorization boundary.
