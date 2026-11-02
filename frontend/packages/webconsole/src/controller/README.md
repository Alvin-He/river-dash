# UI Controller, Mode/Valve Controls, and Operator Event Log

## Scope

This implementation runs with **mock topics only**. It does not connect to hardware and must not be used to control a physical stand. Valve handles now match `nile-common/src/comms/commands/controls.rs` (seven valves). Mode availability, topic payloads, and state reports are still provisional. No hardware commands are sent.

## Responsibilities

- `valves.ts`: seven canonical `nile-common` two-byte valve handles and descriptive groups; no actuation logic.
- `topics.ts`: typed contracts for mode reports, mode requests, valve reports, valve requests, and command responses.
- `UIController.ts`: interface consumed by modules; publishes requests but does not manufacture acknowledgments or reported states. Also validates provisional UI valve availability.
- `MockTopicStore.ts`: in-memory topic snapshots and listener management; replace with a real GDT adapter.
- `MockStand.ts`: deliberately manual simulation of reported modes, reported valve states, and accepted/rejected responses. An accepted mock response does **not** change the reported physical state.
- `OperatorEventLog.ts`: bounded in-memory session log; it is not persistent storage.
- `modules/mode-controls`: mode and valve requests with authoritative state shown separately.
- `modules/operator-events`: filters/search of request, response, report and system entries.
- `modules/mock-stand`: demo publisher, currently occupying the pressure placeholder area.

## Example flow

1. Operator requests `CHECKOUT`: controller publishes `stand/mode/request` with a command ID, then logs a **request**.
2. Simulator responds accepted/rejected: `stand/commands/response` creates a **response** entry. Acceptance does not change the mode.
3. Simulator publishes `CHECKOUT` to `stand/mode`: controller and subscribed modules receive the **reported** mode; the event log records the report.
4. In CHECKOUT, the UI offers valve requests. Selecting Open or Close publishes a request, not a valve state.
5. The simulator must independently publish a valve report for the displayed state to change.

## SAFE / connection-loss behavior

- SAFE mode requests remain available without the normal prerequisites of other transitions. They are still requests, not proof of SAFE.
- Stand-originated SAFE reports update all subscribers without the controller telling modules to call each other.
- SAFE disables individual valve requests in this provisional UI.
- Missing modes are `UNKNOWN` and all valve requests are disabled. Missing valve reports are displayed as `UNKNOWN`.
- SAFE **does not imply that every valve closes**. Never derive individual valve states from mode alone.

## Before hardware integration

The team must approve real valve IDs, mode transition conditions, backend command schema, command status lifecycle (queued/sent/accepted/rejected/completed/timed-out), report freshness and disconnection behavior, fire controls and authorization, priority of SAFE, durable logging and replay. The backend/stand must enforce all safety interlocks; frontend restrictions are advisory UX. A real GDT adapter must preserve topic snapshots, unsubscribe behavior and data type conversion. The current operator event log has a 500-entry session limit and does not persist to disk; backend logging is required for the actual operational audit trail.

Automated tests are deferred as requested. Build and manually review in the browser before creating the PR.

## Valve mapping (step 1)

NILE `Control::OpenValve`/`CloseValve` use two ASCII bytes for each valve. The
webconsole uses those exact handles as its mock topic keys:

| Handle | Valve | Group |
| --- | --- | --- |
| `OP` | Oxidizer pressure | Pressure |
| `OV` | Oxidizer vent | Vent |
| `OR` | Oxidizer run | Run |
| `OF` | Oxidizer fill | Fill |
| `FP` | Fuel pressure | Pressure |
| `FV` | Fuel vent | Vent |
| `FR` | Fuel run | Run |

Only `OF` and `OV` are manually available in mock `OX_FILL` mode. Mock
`CHECKOUT` permits all seven; mock `SAFE` and `PRESSURIZATION_FIRE` do not
permit manual valve requests. These frontend restrictions **are not stand
interlocks**. `nile-stand` currently publishes an incomplete inferred valve
report (five fields, with duplicated labels and missing vents), so the UI must
show missing reports as `UNKNOWN`. In particular, neither the SAFE command nor
a cleared DSUB output state proves that all physical valves are closed.

Next step (not included here): a separately reviewed, simulation-only mode
transition policy. Nothing in this change modifies the NILE repos or sends
commands to the stand.
