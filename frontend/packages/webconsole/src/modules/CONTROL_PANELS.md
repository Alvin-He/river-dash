# Operator controls and event history

These modules follow the current River Dash dark, modular dashboard styling. The early Figma design guides the hierarchy (mode selector, valve buttons, event messages); the later engineering feedback takes precedence where it changes operational meaning.

## Mode & valve control

The top section shows the **stand-reported mode**, not the most recently requested mode. The operator chooses a desired non-SAFE mode and clicks **Request**; **Request SAFE** stays separately accessible. SAFE is not defined as "close every valve". The frontend must not represent either a submitted request or an accepted response as proof of physical actuation.

The valve table is placed immediately below the compact mode section to remain discoverable in a small draggable/resizable module. Each row shows the **reported** valve state and Open / Close **requests**. Disabled controls indicate unavailable actions rather than alarms. Unknown reports are displayed as UNKNOWN. The current valve inventory and permissions are *illustrative mock data*; real stand IDs, command permissions, and backend safety interlocks must be specified before connecting hardware.

## Operator event log

The log displays session-local REQUEST, RESPONSE, REPORT, and SYSTEM messages. Filtering and searching are available without exporting. The temporary CSV button was removed from the operator panel because it implied a logging/export workflow that isn't part of the operator's immediate task. Persistent storage, complete command/telemetry logging, and export or replay should be provided by a dedicated backend logging workflow, as required by the project specification.

## Integration notes

The modules subscribe through `UIController` and `OperatorEventLog`; they never call each other. The mock stand simulator can publish independent mode and valve reports and simulated responses. The UI is simulation-only. The modules were deliberately kept compatible with the existing `ModuleFrame`, movable windows, and current layout dimensions. Automated tests remain out of scope for this iteration as requested.
