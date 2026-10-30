# River Dash webconsole

React, TypeScript, Vite, and `react-rnd` frontend for the NILE test-stand dashboard.

## Run locally

From `frontend/`, install dependencies with `npm install`, then use the `webconsole` workspace:

```sh
npm run dev --workspace=webconsole
npm run build --workspace=webconsole
npm run lint --workspace=webconsole
```

During development, `/login` provides a mock sign-in and `/dashboard` shows the console. The mock authentication behavior and its security limitations are documented in [AUTH_DEVELOPMENT.md](./AUTH_DEVELOPMENT.md).

## Dashboard modules and layout

`src/components/DashboardCanvas/DashboardCanvas.tsx` registers visible modules. Layout geometry, snapping, and resize constraints are implemented in `src/layout/dashboardLayout.ts` and orchestrated by `src/layout/useDashboardLayout.ts`.

- [Module authoring](./src/modules/README.md)
- [Shared component contracts](./src/components/README.md)
- [Layout behavior and registration](./src/layout/README.md)
- [Repository-wide module developer guide](../../../MODULE_DEVELOPER_GUIDE.md)

The dashboard fills its browser window. Its default geometry uses a 1920 × 1080 reference; smaller windows adapt panel sizes and reflow when minimum panel dimensions require it.
The header currently displays a hard-coded connection/rate label; it does not indicate verified live connectivity or a measured telemetry frequency.

## Fullscreen

On `/dashboard`, the header's **Full screen** button requests fullscreen for the dashboard. **Exit full screen** or **Esc** returns to the windowed view. The button is disabled if the browser does not expose the Fullscreen API, and the interface displays an error if the request fails. Fullscreen changes viewport sizing but does not reset the committed module layout.
