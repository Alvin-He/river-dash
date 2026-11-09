# River Dash

River Dash is a browser-based dashboard for the NILE test stand. The current
frontend provides movable and resizable panels, demonstration telemetry and
graphs, mock mode/valve controls, and an in-memory operator event log. The P&ID
panel remains a placeholder. **The stand simulator does not control hardware.**
Live stand communication, shared viewer telemetry, and durable event logging are
not implemented in the current dashboard.

## Local development

Start the Rust backend on port `3000` using the backend setup instructions.
Then, from `frontend/`:

```sh
npm install
npm run dev --workspace=@river-dash/webconsole
```

Open **http://127.0.0.1:5173** on the host computer for the operator dashboard.
The integrated frontend gateway automatically classifies other LAN connections
as viewers; they sign in using an account created by the local operator.

For a built operator dashboard, run:

```sh
npm run build --workspace=@river-dash/webconsole
npm run preview --workspace=@river-dash/webconsole
```

This preview is normally available on port `4173`.

## Optional remote viewing

Remote viewing is **off by default** and is never required for local operator
use. In the operator dashboard, open **Viewer management** to create credentials
or enable a temporary Cloudflare Quick Tunnel. When enabled, the frontend host
starts a separate **viewer-only** server on `127.0.0.1:4174` and a managed
`cloudflared` process. The generated HTTPS URL appears in the menu.

Creating an account does **not** automatically enable public access. Disabling
remote viewing stops the tunnel without stopping the operator dashboard.

See [optional Cloudflare setup](frontend/packages/webconsole/CLOUDFLARE_TUNNEL.md)
and [authentication and gateway behavior](frontend/packages/webconsole/AUTH_DEVELOPMENT.md).

## Safety and access boundaries

- The Rust backend accepts configuration and account-write requests. Keep
  backend port **3000** inaccessible to remote viewers. The frontend gateway
  rejects viewer writes but cannot protect direct backend connections.
- Do **not** point Cloudflare at the operator dashboard (`5173`) or backend
  (`3000`). Only the viewer gateway (`4174`) is intended for the public tunnel.
- Simulated mode/valve reports are not hardware feedback. In particular,
  SAFE mode does not prove that every valve is closed.
- Viewers currently run their own browser-local mock streams, rather than
  receiving the operator's live simulator state.

This access gateway is intended for a small test group, not as authorization
for real hardware operation.

## Codebase and checks

- [Webconsole development and modules](frontend/packages/webconsole/README.md)
- [Module developer guide](MODULE_DEVELOPER_GUIDE.md)
- [Shared data source](frontend/packages/global_data_source/README.md)
- [Contributor guidelines](CONTRIBUTING.md)

From `frontend/`:

```sh
npm run test:lan-access --workspace=@river-dash/webconsole
npm run lint --workspace=@river-dash/webconsole
npm run build --workspace=@river-dash/webconsole
```

