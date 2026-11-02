# UI Controller, Mode/Valve Controls, and Operator Event Log

## Scope

This implementation runs with **mock topics only**. It does not connect to hardware and must not be used to control a physical stand. Valve handles now match `nile-common/src/comms/commands/controls.rs` (seven valves). Mode availability, topic payloads, and state reports are still provisional. No hardware commands are sent.

## Responsibilities

- `valves.ts`: seven canonical `nile-common` two-byte valve handles and descriptive groups; no actuation logic.
- `modeRules.ts`: pure, advisory entry/exit requirement evaluator based on the NILE console specification; never actuates valves.
- `topics.ts`: typed contracts for mode reports, mode requests, valve reports, valve requests, simulation-only Fire requests, and command responses.
- `UIController.ts`: interface consumed by modules; checks mock transition eligibility before publishing mode requests, but does not manufacture acknowledgments or reported states. Also validates provisional UI valve availability.
- `MockTopicStore.ts`: in-memory topic snapshots and listener management; replace with a real GDT adapter.
- `MockStand.ts`: queues mock requests and evaluates each against the latest mock state. The demo enables auto-processing: mock responses and subsequent simulated reports are published on separate timer ticks. A manual switch keeps rejection/delayed-report testing available. No actuation is performed.
- `OperatorEventLog.ts`: bounded in-memory session log; it is not persistent storage.
- `modules/mode-controls`: mode and valve requests with authoritative state shown separately.
- `modules/operator-events`: filters/search of request, response, report and system entries.
- `modules/mock-stand`: demo publisher, currently occupying the pressure placeholder area.

## Example flow (auto-demo enabled by default)

1. Click **CHECKOUT** in Mode & Valve Control: the controller publishes a
   `stand/mode/request` with a unique demo command ID and records a **REQUEST**.
2. The mock simulator evaluates the request on a later timer tick and publishes
   an accepted/rejected **RESPONSE**. The reported mode is still unchanged.
3. If accepted, a _separate simulated_ `stand/mode` **REPORT** is published on
   another tick. Only then do Mode Controls and the header display CHECKOUT.
4. In CHECKOUT, click a valve **Open** or **Close** button. A distinct request,
   response, and mock valve report update just that valve; other valve states
   remain UNKNOWN until reported.
5. To test rejected requests, missing reports, or long-running pending statuses,
   uncheck **Auto-process mock commands** in Mock Stand Simulator. Its manual
   buttons then evaluate requests and separately publish accepted reports.

These steps model UI message flow only. Neither a mock response nor its fabricated
mock report is physical valve-position feedback.

## SAFE / connection-loss behavior

- SAFE mode requests remain available without the normal prerequisites of other transitions. They are still requests, not proof of SAFE.
- Stand-originated SAFE reports update all subscribers without the controller telling modules to call each other.
- SAFE disables individual valve requests in this provisional UI.
- Missing modes are `UNKNOWN` and all valve requests are disabled. Missing valve reports are displayed as `UNKNOWN`.
- SAFE **does not imply that every valve closes**. Never derive individual valve states from mode alone.

## Before hardware integration

The team must confirm transition sequencing and mode authority, backend command schema, command status lifecycle (queued/sent/accepted/rejected/completed/timed-out), report freshness and disconnection behavior, fire controls and authorization, priority of SAFE, durable logging and replay. The backend/stand must enforce all safety interlocks; frontend restrictions are advisory UX. A real GDT adapter must preserve topic snapshots, unsubscribe behavior and data type conversion. The current operator event log has a 500-entry session limit and does not persist to disk; backend logging is required for the actual operational audit trail.

The policy tests in `modeRules.test.ts` are simulation-only and do not validate hardware behavior.

## Valve mapping (step 1)

NILE `Control::OpenValve`/`CloseValve` use two ASCII bytes for each valve. The
webconsole uses those exact handles as its mock topic keys:

| Handle | Valve             | Group    |
| ------ | ----------------- | -------- |
| `OP`   | Oxidizer pressure | Pressure |
| `OV`   | Oxidizer vent     | Vent     |
| `OR`   | Oxidizer run      | Run      |
| `OF`   | Oxidizer fill     | Fill     |
| `FP`   | Fuel pressure     | Pressure |
| `FV`   | Fuel vent         | Vent     |
| `FR`   | Fuel run          | Run      |

Only `OF` and `OV` are manually available in mock `OX_FILL` mode. Mock
`CHECKOUT` permits all seven; mock `SAFE` disables manual controls. In `PRESSURIZATION_FIRE`, only `OP`,
`OV`, `FP`, and `FV` are manually available (NILE specification section 3.4). These frontend restrictions **are not stand
interlocks**. `nile-stand` currently publishes an incomplete inferred valve
report (five fields, with duplicated labels and missing vents), so the UI must
show missing reports as `UNKNOWN`. In particular, neither the SAFE command nor
a cleared DSUB output state proves that all physical valves are closed.

## Mode eligibility (step 2)

`evaluateModeTransition(reportedMode, requestedMode, valveReports)` is a pure
function. The controller calls it before publishing a mock mode request, and
Mode Controls calls it to disable ordinary ineligible transitions and expose
explanations in button tooltips. The current **reported** mode remains
unchanged until the stand simulator publishes a separate report.

These are direct interpretations of the NILE console specification, Controls
(page 5):

| Mode                | Entry requirement                                         | Exit requirement        |
| ------------------- | --------------------------------------------------------- | ----------------------- |
| SAFE                | Bypasses ordinary transition requirements                 | None specified          |
| CHECKOUT            | None specified                                            | None specified          |
| OX_FILL             | All seven valves CLOSED                                   | All seven valves CLOSED |
| PRESSURIZATION_FIRE | Pressure, run and oxidizer fill valves CLOSED; vents OPEN | Run valves CLOSED       |

If a required valve report is missing or `UNKNOWN`, it **does not** satisfy a
condition. Normal transitions also require a known reported mode. SAFE remains
requestable even with no telemetry, but this does not prove the request was
received, that the stand is safe, or that any valve has moved.

**No sequencing is performed.** In particular, OX_FILL's exit requirement
(all closed) and PRESSURIZATION_FIRE's entry requirement (vents open) are
incompatible in one snapshot. The frontend cannot invent a valve-transition
procedure. It will leave this direct transition unavailable until an approved
stand-side procedure exists. The real NILE stand has no reported operating-mode
state and the `Control` protocol has no `SetMode` command; these mock mode
requests cannot control physical hardware. The stand and backend remain the
only possible authorities for real interlocks and command execution.

## Mock request processing (step 3)

`MockStand` now queues all incoming mode and valve requests, deduplicating by
unique demo request ID. **SAFE requests are processed before ordinary queued
requests** in the simulator. A request is revalidated when the operator clicks
**Evaluate next request (mock)**, so a mode or valve report that changed since
the request was queued can cause a simulated rejection. A separate **Reject next
request (mock)** button lets developers exercise rejection handling.

- Each queued request gets at most one mock response. Queued requests cannot be
  acknowledged repeatedly by clicking the button.
- An **accepted mode request** is placed on an explicit list of simulated mode
  reports. Only **Publish accepted mode report (mock)** publishes a new reported
  mode, demonstrating that acknowledgment and state telemetry are distinct.
- An **accepted valve request** is queued for a distinct simulated telemetry
  report. The **Publish accepted valve report (mock)** button updates the
  matching reported valve to OPEN or CLOSED; other valves remain unchanged or
  UNKNOWN. A request or acknowledgment alone never changes the display.
- Nothing auto-opens or auto-closes valves. Entering reported SAFE does not
  imply valves are closed, and missing reports remain `UNKNOWN`.
- This is an educational browser-only mock. SAFE queue prioritization and
  revalidation are not claims about the behavior or timing of the actual stand;
  the real command protocol does not include an operating-mode command.

`MockStand.test.ts` covers request ordering, SAFE priority, acceptance versus
reported mode, stale-condition rejection, valve restrictions, unknown telemetry,
and duplicate requests. No external NILE repository is modified.

## Reported state and two-button controls (step 4)

Each valve has **Open** and **Close** buttons. A solid green outline and the
"Reported" label mean that a stand-topic report carries that position; this
is **not independent physical feedback**. Solid orange denotes an available
alternative action; dashed orange denotes a pending request. Unknown or
unavailable states are displayed explicitly, not inferred from another valve
or from SAFE mode. The mode-request buttons use the same visual semantics.

`TopicUIController` records browser-only command activity by unique demo ID:
`SENT` after publishing a request, `ACCEPTED` after a positive mock response,
and removed on rejection or a later matching topic report. The latter is a UI
correlation convenience, not proof that a particular command caused the report.
The simulator explicitly publishes accepted valve reports so developers can
exercise the status transitions and event log. No external NILE code changes
or live hardware interactions are involved.

## Auto-processing in the browser demo (step 5)

The previous simulator required three separate clicks: request in Mode Controls,
"Evaluate next request", and "Publish accepted report". That made the UI seem
broken when no reports arrived. **The demo composition root now enables automatic
mock processing** (`new MockStand(topics, { autoProcess: true })`).

- A mode or valve click publishes a **REQUEST**. After a short demo delay, the
  simulator rechecks the policy and publishes a **RESPONSE**. On a later timer
  tick it publishes a distinct **REPORT** on the appropriate topic. The UI
  updates only from that report; no optimistic UI update is used.
- The simulator's **Auto-process** checkbox can be unchecked to resume manual
  processing, force rejection, withhold reports, and exercise pending states.
- When SAFE is accepted in auto mode, earlier unreported mock actions are
  canceled rather than publishing stale mode/valve reports after SAFE.
- This behavior exists **only inside MockStand** and the browser's mock store.
  `nile-common` does not define a mode command, and a real NILE stand must not
  be assumed to auto-report success or physical valve movement. The simulated
  reports are not hardware feedback. SAFE never resets valve state to CLOSED.
- Ordinary transitions still require all relevant reported conditions. Unknown
  valve states remain UNKNOWN until an explicit or generated _mock_ report.

## Command lifecycle and operator event log (step 6)

The browser-only controller maintains two complementary views of operator requests:

- `getCommandActivity()` lists only in-flight requests (`SENT`, `ACCEPTED`).
  Mode/valve buttons use this to disable conflicting actions until a response
  or later matching topic report arrives.
- `getCommandHistory()` retains the most recent 100 request records by **unique
  demo request ID**. Each record has a lifecycle status: `SENT`, `ACCEPTED`,
  `REPORTED`, `REJECTED`, or `SEND_FAILED`. The controls use the ID returned by
  `requestMode()` / `requestValve()` to show the outcome of the exact request,
  rather than assuming that a matching target proves success.

`REPORTED` means only that a _later_ topic update matched one accepted request.
The mock topics have no ID field on state reports, so this is a best-effort
correlation for the browser demo. It is **not** confirmation of physical valve
movement, command causality, or hardware safety. A single report retires at
most one accepted matching request. Responses are correlated by their unique
mock request ID, and rejections remain visible in the bounded history even
when the displayed reported state already equals the requested target.

The Operator Event Log includes request IDs where available, keeps REQUEST,
RESPONSE, and REPORT events distinct, and remains a separate 500-entry,
nonpersistent session log. It has a compact event count, left-aligned rows, and
no CSV export. Neither the history nor the log is a durable hardware audit trail.

No transport wiring, live backend commands, or external NILE code is changed
in this step. Real command correlation and timeout semantics will depend on
future River Dash backend integration; the existing `nile-common` command IDs
identify command _types_, not individual requests.

## Pressurization / Fire mode and compact controls (step 7)

Per NILE specification section 3.4, ordinary entry requires pressure and run
valves CLOSED, the oxidizer fill valve CLOSED, and both vents OPEN. The exit
condition is both run valves CLOSED. `modeRules.ts` implements those checks;
no automatic valve actuation or mode sequencing is performed.

The compact mode panel exposes only these manual valves in the reported
`PRESSURIZATION_FIRE` mode: oxidizer pressure (`OP`), oxidizer vent (`OV`),
fuel pressure (`FP`), and fuel vent (`FV`). Run (`OR`, `FR`) and fill (`OF`)
valves are unavailable. Checkout continues to expose all seven, oxidizer fill
exposes `OV`/`OF`, and SAFE exposes no manual valve controls. Green outlines
reflect _reported simulated topic state_, not measured hardware positions.

The mode panel includes three user-provided integer fields in microseconds:
`burn_time_micros` (positive u64), `ignition_offset_micros` (signed i64), and
`propellants_offset_micros` (signed i64), matching the field names and units of
`nile-common`'s `Control::Fire` variant. JavaScript cannot exactly represent
all Rust 64-bit integers, so the mock only accepts safe integer values and does
not round or clamp user input. A Fire button appears only in reported
`PRESSURIZATION_FIRE` and is labeled **mock only**.

**Important: this does NOT issue a real `Control::Fire` command.** The browser
publishes a simulation-only `stand/fire/request/mock` topic. `MockStand` can
acknowledge or reject that request, but it never executes a firing sequence,
changes valve reports, or communicates with NILE hardware. Acknowledgment is
recorded as `ACCEPTED` and is terminal because no fire-state report topic
exists. This is UI-protocol simulation, not an operational firing control.
The NILE stand and shared protocol repositories are unchanged.

`PressurizationFire.test.ts` exercises the four allowed valves, other modes'
permissions, timing validation, explicit mock responses, and failure when the
reported mode changes before the request is evaluated.
