# Telemetry Overview channel visibility (front-end-ui-modules)

This change builds on the `front-end-ui-modules` source with the floating menu, named layout configurations, and configurable time-series graph. `frontend-auth` was not edited.

## Use

1. In **Telemetry overview**, select **Channels** in the module header.
2. Check or uncheck each channel to show or hide its row. **Show all** clears hidden-channel choices; **Hide all** hides every currently available row. The chooser remains available if all channels are hidden.
3. The table summary shows `shown / available` channels. Channels appear alphabetically. The chooser has its own scrollbar at small module heights; Escape or Close dismisses it.
4. Visibility only changes the **Telemetry Overview table**. It does **not** stop subscriptions, discard incoming readings, change logging, or change which measurements are plotted in the time-series graph. The graph has independent measurement controls.

Newly arriving channel names are visible by default, while previously hidden channels stay hidden if they disappear and return. Selections auto-save in the current browser under `river-dash-telemetry-overview-v1`, separate from the dashboard geometry autosave and graph settings. If browser storage is unavailable, the controls still work for the current session.

## Saved layout integration

Newly saved named layouts include optional `telemetrySettings` alongside `layout`, `referenceWidth`, and optional `graphSettings`. Loading a layout with telemetry settings restores hidden channels; JSON export/import retains the choices. Older layout configurations **without** `telemetrySettings` continue to work and leave the currently selected channels unchanged. The portable file format remains `river-dash-layout`, version 1.

## Source files

- `frontend/packages/webconsole/src/modules/telemetry/TelemetryModule.tsx`: header Channels button, popover, checkbox controls, filtering.
- `telemetry/TelemetryModule.module.css`: popover and scrollable options.
- `telemetry/telemetrySettings.ts`: input validation, storage, bulk visibility helpers.
- `components/DashboardCanvas/DashboardCanvas.tsx`: collect/restore telemetry settings with module geometry.
- `layout/layoutConfigurations.ts`: optional telemetry settings in named layouts and portable files.
- `telemetry/telemetrySettings.test.ts` and `layout/layoutConfigurations.test.ts`: unit cases.

The current default telemetry stream is synthetic. When that stream is used, the header explicitly shows **Demo** rather than claiming verified live telemetry.

## Local checks

From `frontend/`, after installing dependencies for your OS:

```sh
npx tsc -p packages/webconsole/tsconfig.app.json --noEmit
npm run lint -w webconsole
npx vitest run packages/webconsole/src/modules/telemetry/telemetrySettings.test.ts packages/webconsole/src/layout/layoutConfigurations.test.ts
npm run dev -w webconsole
```

In the browser, test individual and bulk toggles, reload persistence, closing/reopening the panel, changing stream channel names, and save/load/export/import of a named layout. Verify that a 300px-wide / 190px-tall Telemetry Overview can scroll through the options without moving/resizing the dashboard module.
