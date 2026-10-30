# Mock login (development only)

River Dash now has two separate pages:

- `/login` — username/password form. The password is visible by default, with a **Hide / Show** toggle. A failed attempt displays an inline error without clearing either field.
- `/dashboard` — the existing dashboard. A successful login redirects here.

## Temporary credentials

| Field | Value |
| --- | --- |
| Username | `operator` |
| Password | `riverdash123` |

Mock sessions are saved in `sessionStorage` for the current browser tab, and the dashboard's **Sign out** button clears the session and opens `/login`.

For development, run `npm run dev` inside `frontend/packages/webconsole` (or use the workspace command from `frontend`). On the Vite development server, `/dashboard` is directly accessible even without logging in; `/login` also has a shortcut link. **This bypass is disabled by `import.meta.env.DEV` in production builds.**

**Security note:** This is client-only mock authentication, not real user verification or authorization. The mock credentials are visible in frontend source and are not safe for production use. Implement real backend sessions, server-side authorization for every command/telemetry endpoint, and appropriate operator permissions before connecting to live test-stand controls.
