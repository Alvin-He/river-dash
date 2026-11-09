# Backend access boundary

This document describes authentication and authorization responsibilities
between the River Dash frontend gateway and the Rust/Axum backend.

## Backend routes and constraints

The frontend uses the backend's `/login`, `/logout`, `/setup`, and `/configs`
endpoints. The backend does not expose a `/session` endpoint, and it bypasses
some authentication checks for loopback clients. Because Vite proxies requests
from loopback, **backend authentication alone cannot distinguish remote
viewers from local operators**.

The frontend gateway therefore enforces a separate viewer role and restricts
viewer API calls to login/logout and authenticated configuration reads.
Viewer logins are tracked by the gateway using the hash of the issued session
cookie. Configuration writes and account creation are rejected for viewers
before reaching Rust. The dedicated Cloudflare entry point is always
viewer-only, including when the tunnel connects from `127.0.0.1`.

This is a development-stage access boundary, not a substitute for backend
authorization. Do not expose the Rust service on port `3000` directly to
viewer devices or the public internet.

## Local database setup

A new SQLite database may need its users/sessions tables initialized before
viewer accounts can be created. With the Rust backend stopped, run:

```sh
python tools/init_local_database.py
```

Back up existing databases before running setup tools. Account records and
session data are local runtime data; never include them in public source or
source archives.

## Further reading

- [Frontend roles and authentication](frontend/packages/webconsole/AUTH_DEVELOPMENT.md)
- [Optional Cloudflare Quick Tunnels](frontend/packages/webconsole/CLOUDFLARE_TUNNEL.md)

The stand simulator and demo telemetry remain browser-local. Backend API
access does not by itself implement shared telemetry, hardware commands, or
persistent logging.
