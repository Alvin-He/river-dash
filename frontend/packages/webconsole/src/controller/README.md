# Mode and valve controls

This directory implements the **browser-only stand simulator** used by River Dash's
Mode & Valve Control and Operator Event Log modules. It does not connect to a
NILE stand, send `nile-common::Control` commands, or verify physical valve
positions. All mode and valve reports produced by `MockStand` are simulated.

The external NILE repositories are reference sources, **not dependencies that
River Dash modifies**. See [NILE protocol compatibility](./NILE_PROTOCOL_COMPATIBILITY.md)
for the precise mapping and known gaps.

## Structure

| Component             | Responsibility                                                             |
| --------------------- | -------------------------------------------------------------------------- |
| `topics.ts`           | Typed **browser-only** topic names and payloads.                           |
| `valves.ts`           | NILE's seven two-character valve handles and descriptive groups.           |
| `modeRules.ts`        | Pure, advisory mode transition checks and manual valve permissions.        |
| `fireTiming.ts`       | Field definitions and input validation for simulated Fire requests.        |
| `UIController.ts`     | Frontend API for reports, requests, lifecycle status, and event recording. |
| `MockTopicStore.ts`   | In-memory topic snapshots and publish/subscribe.                           |
| `MockStand.ts`        | Queued request evaluation and simulated response/report generation.        |
| `OperatorEventLog.ts` | Bounded, session-only records of requests, responses and reports.          |
| `demoController.ts`   | One shared simulator, controller, topic store, and event log.              |
| `useStandMode.ts`     | React subscription wrapper for reported mode changes.                      |

React modules consume the `UIController` interface rather than reading or
writing topics directly. The mock simulator is the only consumer that generates
stand-like responses to these request topics.

## Mode policy

The current rules implement the NILE console specification's **UI policy**, not
stand-side safety interlocks. All valve conditions refer to the latest mock
report; an absent/`UNKNOWN` value never satisfies a required condition.

| Mode                  | Entry conditions                                                                        | Exit conditions         | Manual valves                        |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------ |
| `SAFE`                | Bypasses ordinary pre-/postconditions                                                   | None specified          | None                                 |
| `CHECKOUT`            | None specified                                                                          | None specified          | All seven                            |
| `OX_FILL`             | All seven CLOSED                                                                        | All seven CLOSED        | Oxidizer fill (`OF`) and vent (`OV`) |
| `PRESSURIZATION_FIRE` | Pressure (`OP`, `FP`), run (`OR`, `FR`) and fill (`OF`) CLOSED; vents (`OV`, `FV`) OPEN | Run (`OR`, `FR`) CLOSED | `OP`, `OV`, `FP`, `FV`               |

`evaluateModeTransition()` checks the current mode's exit conditions and the
requested mode's entry conditions against one reported snapshot. It **does not**
move valves to meet those conditions. Direct `OX_FILL` →
`PRESSURIZATION_FIRE` is therefore unavailable: the former requires closed
vents on exit, while the latter requires open vents on entry. No transition
sequencing is defined here.

`canRequestValve()` centralizes manual permissions for both the UI and mock
simulator. A reported SAFE mode prevents individual mock valve requests, but
**SAFE does not mean all valves are closed**. In NILE hardware, safing is a
separate predefined control action with valve-dependent behavior.

## Request and report lifecycle

1. The operator requests a mock mode/valve action through `UIController`.
   The controller assigns a unique `demo-*` request ID and records `REQUEST`.
2. `MockStand` queues the request and rechecks the current mock policy when
   evaluating it. The simulator publishes a separate `RESPONSE` (accepted or
   rejected). Acceptance does not change reported state.
3. For accepted mode/valve requests, `MockStand` can publish a later simulated
   `REPORT`. Only the report changes the mode or valve display.
4. `UIController` retains the latest 100 request outcomes. A later matching
   topic report may mark one accepted request `REPORTED`, but this correlation
   is informational: reports do not contain a request ID or establish causality.

Automatic simulation is enabled at application startup. The mock simulator UI
can disable automatic processing to exercise delayed reports and explicit
rejection. SAFE is prioritized within the simulator and cancels superseded
work in automatic mode. These are **simulation behaviors**, not guarantees
about command scheduling or safety in the actual stand.

An accepted mock Fire request has no follow-on state topic. It is displayed as
acknowledged, never as proof of a firing event. The UI exposes the three Rust
`Control::Fire` timing fields in microseconds, but publishes only to the
browser-only `stand/fire/request/mock` topic.

## Operational limits

- `nile-common` defines `Safe`, `OpenValve`, `CloseValve`, and `Fire`, **not** a
  `SetMode` command. No physical mode changes are initiated by this UI.
- `nile-console` demonstrates a stream client and TCP command client; River
  Dash does not reuse its transport or copy its startup example commands.
- The stand's available valve reports are inferred from controller outputs and
  do not provide independent confirmation of physical positions. Missing
  reports are shown as `UNKNOWN`.
- The event log is limited to 500 entries in browser memory. It is not a
  persistent stand log and does not implement replay.
- There is no live connection health, timeout handling, authentication,
  authoritative mode enforcement, or hardware command correlation in this
  mock subsystem.

Any future hardware integration requires a reviewed, separate backend adapter
and stand-side authorization. Never forward these mock topics directly to a
live stand or equate a simulated acknowledgment with `CommandResponseKind::Success`.

## Automated tests

The controller's Vitest unit/system tests, separate Playwright browser/UI tests,
commands, and the documented TDD regression are described in the repository's
[`TESTING.md`](../../../../../TESTING.md). All tests use a local simulator;
none sends hardware commands.
