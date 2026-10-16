# Modules

This directory contains domain-specific dashboard modules. Each module gets its
own folder and should compose reusable components from `../components` rather
than duplicating shared layout or styling.

## Items

- `telemetry/TelemetryModule.tsx` — alphabetized raw telemetry display with
  values and time since the latest update. It exposes a `TelemetryReading`
  type so stream data can replace its sample data directly.
- `placeholder/PlaceholderModule.tsx` — temporary content used for modules
  that have not yet been implemented.

## Adding a module

1. Create a folder named for the feature, such as `valve-control/`.
2. Render the feature content inside `ModuleFrame` from `components/ModuleFrame`.
3. Register it in the freeform dashboard canvas in `App.tsx`.
4. Add a short description here.
