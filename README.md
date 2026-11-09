# River Dash

This is River Dash, a live test and engineering dashboard.

River Dash is currently under active development, checkout [CONTRIBUTING.md](./CONTRIBUTING.md) to get started!

Dashboard module integration, geometry registration, and styling responsibilities
are documented in
[MODULE_DEVELOPER_GUIDE.md](./MODULE_DEVELOPER_GUIDE.md).

## Testing

From the repository root, install frontend dependencies and the Playwright browser, then run all workspaces' unit, system, and UI tests:

```sh
cd frontend
npm install
npx playwright install chromium
npm test
```

Run controller-only tests with `npm run test:controller -w @river-dash/webconsole`, or browser UI tests with `npm run test:ui -w @river-dash/webconsole` (from `frontend`). The tests use a local simulated stand only; **no hardware commands are sent**.

See [TESTING.md](./TESTING.md) for detailed setup, coverage, limitations, and the documented **Red–Green–Refactor** workflow for the valve-state snapshot isolation fix.
