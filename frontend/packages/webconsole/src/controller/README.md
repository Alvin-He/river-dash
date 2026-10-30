# River Dash UI Controller — developer guide

> **Scope:** mock-only frontend integration. No hardware connection, command acknowledgement, or physical safety interlock is implemented. This version was adapted to `river-dash-refactored-no-tests.zip` in Project Sources.

## Quick start

From the repository root:

```sh
cd frontend
npm ci
cd packages/webconsole
npm run build
npm run lint
npm run dev
```

The Vite build and lint checks require installed frontend dependencies. Automated tests are deferred to a later phase.

In the running UI, use **Mock stand simulator** to change the *reported* operating mode. Use **Mode requests** to issue an operator *request*. The header and mode-control module both display the stand report; they do not adopt a requested mode until a report arrives.

## Why this exists

The UI needs a way for independent modules to react to changes without importing or calling one another. The controller is a small boundary around a typed publish/subscribe transport. For now that transport is in memory; when the GDT PR is approved, replace it through an adapter rather than rewriting the UI.

## Architecture and responsibilities

| File | Responsibility | Does not do |
| --- | --- | --- |
| `topics.ts` | Defines mock topic names, payloads, and narrow read/write interfaces | Create network connections |
| `MockTopicStore.ts` | Hold current values and notify subscribers | Persist, replay, or distribute data between processes |
| `UIController.ts` | Convert reported mode values to UI state; publish operator requests | Decide physical safety or grant hardware permissions |
| `MockStand.ts` | Represent *stand-originated* reports in demos | Implement a real stand |
| `useStandMode.ts` | Bridge controller subscriptions into React state, with cleanup | Speak GDT directly |
| `demoController.ts` | Instantiate and wire dependencies in one place | Make request acknowledgement automatic |
| `ModeControlsModule.tsx` | Display the reported mode and issue user requests | Claim a request succeeded |
| `MockStandModule.tsx` | Generate simulated stand reports | Control hardware |

```text
Operator -> ModeControlsModule -> UIController -> stand/mode/request
                                                   (request only)
MockStand -> stand/mode -> MockTopicStore -> UIController -> React subscribers
                                     (reported authoritative state in demo)
```

## Topic contract (temporary; not a finalized stand protocol)

| Topic | Mock type | Publisher | Consumers |
| --- | --- | --- | --- |
| `stand/mode` | `OperatingMode` | `MockStand` (later: stand/backend) | Controller and mode-aware UI |
| `stand/mode/request` | `OperatingMode` | Controller | Future request handler/backend |

Valid mock `OperatingMode` values: `SAFE`, `CHECKOUT`, `OX_FILL`, `PRESSURIZATION_FIRE`. `null` in the controller represents **missing or unrecognized reported mode** and is displayed as `UNKNOWN`. These topic strings and payloads must be reconciled with the open GDT PR before integration.

### Subscription behavior

A `TopicReader.subscribe(topic, callback)` implementation must:

1. Register the callback, then immediately deliver the latest value, even if it is `undefined`.
2. Call the callback whenever that topic publishes or is cleared.
3. Return a cleanup function to remove the listener; after cleanup, it must receive no more updates.
4. Keep subscriptions independent of one another. A component mounted later should not wait for the next publish to see the current report.

This contract is necessary for modular dashboards where panels mount, unmount, or pop out over time. Mock notifications are synchronous and process-local; real GDT networking can be asynchronous and may require explicit reconnect handling.

### Read / request example

```ts
import { MockTopicStore } from './MockTopicStore.ts';
import { MockStand } from './MockStand.ts';
import { TopicUIController } from './UIController.ts';

const store = new MockTopicStore();
const controller = new TopicUIController(store, store);
const stand = new MockStand(store);

const unsubscribe = controller.subscribeToMode((mode) => {
  console.log('Stand reports:', mode ?? 'UNKNOWN');
});

controller.requestMode('CHECKOUT'); // Writes request; reported mode unchanged.
stand.reportMode('CHECKOUT');       // Separate simulated stand report.
stand.reportMode('SAFE');           // Simulated stand-initiated SAFE.
unsubscribe();                      // Stop receiving updates.
```

## SAFE behavior and failure states

**Do not equate SAFE with closing all valves.** The River Dash requirements define SAFE as a mode that disables manual valve operation and may be entered without satisfying ordinary postconditions. The exact mechanical actions of the stand must be confirmed with the hardware/backend team.

- An operator SAFE request updates **only** `stand/mode/request`. There is no command receipt, completion status, or automatic mode change in this mock.
- A stand-originated SAFE report changes `stand/mode`; all subscribers observe it, even if the operator made no request.
- A missing or malformed report maps to `null` / `UNKNOWN`, **never SAFE**. Do not claim an unknown stand state is safe.
- The sample controls let the user request SAFE even if the current mode is missing, while other mode buttons require a valid report. **This is only demo UI behavior**, not a complete authorization, transition-condition, E-stop, or interlock implementation.
- In real operation the backend/stand, not the frontend, must own command execution, mode validation, and hardware protections.

## SOLID reasoning

- **Single responsibility:** transport, mode interpretation, mock stand, React hook, and rendering are separated.
- **Open/closed:** a new GDT-backed reader/writer can be supplied without changing `TopicUIController`.
- **Liskov substitution:** new adapters must preserve current-snapshot delivery, notifications, and unsubscribe semantics; implementing the TypeScript method signatures alone is insufficient.
- **Interface segregation:** reading and writing are separate interfaces; display-only consumers need only the narrow `UIController` interface.
- **Dependency inversion:** `TopicUIController` takes `TopicReader` and `TopicWriter`, not `MockTopicStore` or concrete GDT classes.

Do not add abstractions unless they make a real dependency boundary clearer. In particular, components must never import one another merely to broadcast a mode update.

## How to replace the mock with GDT

The uploaded `global_data_source.zip` has `GDT.get_topic`, `TopicOpenMode`, `EventTopicInitialized`, `EventTopicUpdate`, and `read_data`/`write_data`. A future `GdtTopicAdapter` can implement `TopicReader`/`TopicWriter` and be created in `demoController.ts` (renamed as the app's composition root). It should:

1. Confirm exact topic names, wrapped data types (`Enum`, `Message`, etc.), writer ownership, and declaration format with the merged GDT code.
2. Attach topic-initialized listeners **before** trying to open an absent topic; also subscribe to topic-update events.
3. Convert and validate wrapped runtime values. Translate unavailable/invalid reports to `undefined` so the controller shows UNKNOWN.
4. Reconcile initial snapshot vs update ordering and cleanup all event listeners; define reconnection semantics explicitly.
5. Specify a real command protocol: IDs, acknowledgements, error handling, authorization, ordering, duplicate requests, and transport failures. The current `requestMode()` returns `void` and cannot report execution success.

The provided GDT source's `network_stream.ts` does not demonstrate a working physical network transport. Do not assume browser-to-stand communication is complete.

## Where it attaches to the current frontend

- `App.tsx` is still the shell and passes the controller and simulator into `DashboardCanvas`.
- `DashboardCanvas.tsx` owns windows and module layout, and hosts the two demo mode panels.
- `ConsoleHeader.tsx` receives a display-only `standMode` prop and is not coupled to the controller implementation.
- `ModuleFrame` and existing resize/layout logic are unchanged. Telemetry/graphs remain simulated and are labeled as demo data.

## Review checklist (manual for now)

Automated tests have been intentionally deferred. Before PR review, manually verify the following behaviors in the mock UI:

- [ ] Requests never optimistically update the reported mode.
- [ ] UNKNOWN and SAFE are visually distinct.
- [ ] Unmounting panels removes subscriptions.
- [ ] No UI module directly calls another module.
- [ ] Simulated data and controls are clearly labeled.
- [ ] Actual GDT integration and physical safety are left explicitly out of scope.

Future work: add automated checks for missing reports, separate request/report topics, independent subscriptions, stand-initiated SAFE, late subscribers, cleanup, invalid data, and malformed requests.

## Known limitations

No real telemetry topic adapter, command response/acknowledgement, hardware connection, network reconciliation, or safety-interlock implementation is included. The mock is intended for development and architecture demonstrations, not operational control of a physical stand.

## Integration with the October 30 River Dash source

The dashboard retains its login route, fullscreen support, reset-layout behavior, and viewport-aware resizable modules. The UI Controller is instantiated separately and passed through props to the mode controls and mock stand simulator. The header receives only the reported mode as a value. No real stand transport is connected.

The mock stand occupies the existing events-module slot for demonstration; it does not replace an actual event or command acknowledgment log.

**Apply the patch from the repository root** with `git apply --check <patch-file>` and then `git apply <patch-file>`. Do not also apply the earlier patch.
