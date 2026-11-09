# Mock stand controls and event history

The operator dashboard includes a **Mode & Valve Control** module and an
**Operator event log**. Both use the browser-local stand simulator; neither
communicates with NILE hardware. Viewer sessions do not have access to the
simulated control buttons.

## Mode and valve controls

The control module displays simulated stand-reported modes and valve states.
Available requests depend on the reported mode. Request acknowledgment does
not confirm that a valve moved or that a mode transition completed.

The simulated Fire action validates its timing inputs and records a request,
but does not execute a firing sequence or send a hardware command. SAFE mode
must not be described as closing every valve.

See [the controller documentation](../controller/README.md) for the mock
request/response behavior and operating-mode rules.

## Operator event history

The event module displays requests, responses, simulated stand reports, and
system messages. It supports filtering and searching, but its records exist
only for the current browser session. Persistent logging and replay require a
backend data source.

## Hardware integration

A future hardware-connected implementation must validate commands and enforce
operating-mode restrictions at the stand/backend boundary. Disabling buttons
in the frontend does not provide authorization or operational safeguards.

The modules are registered in
[`DashboardCanvas.tsx`](../components/DashboardCanvas/DashboardCanvas.tsx).
