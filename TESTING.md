# Testing River Dash

All stand-controller tests are **browser-only simulations**. They do not send commands to NILE hardware or prove physical valve positions, even if a simulated request is accepted or marked `REPORTED`.

## Tools and test levels

| Level | Tool | Location | What it verifies |
| --- | --- | --- | --- |
| Unit | Vitest | `frontend/packages/webconsole/src/controller/*.unit.test.ts` and existing `*.test.ts` | Controller validation, mode/valve policy, fire timings, event-log limits, subscription isolation. |
| System | Vitest | `frontend/packages/webconsole/src/controller/UIController.system.test.ts` plus existing controller integration tests | `TopicUIController` + `MockTopicStore` + `MockStand` + event log request/response/report behavior. |
| UI | Playwright (Chromium) | `frontend/packages/webconsole/e2e/controller.spec.ts` | The visible mode/valve panel with a real browser, operator clicks, mock rejection, reported status, and Fire form validation. |
| Other package | Vitest | `frontend/packages/global_data_source/src/tests/` | Existing global data source tests. |

## Setup and commands

Use Node.js compatible with Vite 8 (Node 22.12+ or a later supported version) and npm. From the project root:

```sh
cd frontend
npm install
npx playwright install chromium
npm test
```

The full `npm test` command executes global data source tests, controller unit/system tests, and Playwright UI tests. Test scripts are defined in `frontend/package.json` and each workspace's `package.json`. To run a subset from `frontend`:

```sh
npm run test:controller -w @river-dash/webconsole
npm run test:ui -w @river-dash/webconsole
npm run test -w @river-dash/global-data-source
```

Playwright starts a local Vite development server automatically on `127.0.0.1:4173` for the UI fixture at `/controller-test.html`. The port must be free. Its browser installation can need additional system libraries (e.g. `npx playwright install --with-deps chromium` on Linux). CI and a fresh checkout must run `npm install`; do not reuse `node_modules` copied from another OS. No `.env`, database, seed account, live telemetry source, backend server, or networked test stand is required.

## TDD: Keep reported valve snapshots separate from consumers

**Requirement / bug:** The controller returned the same mutable `ValveStates` object held by the shared mock topic store. A consumer assigning `controller.getValveStates()!.OF = "OPEN"` could silently modify another consumer's latest reported snapshot **without any stand report**. The same risk existed for the subscription callback. This is especially important because operator-facing telemetry must not be confused with commands or UI state.

1. **Red**: Added `UIController.unit.test.ts` test `does not let a consumer mutate a reported valve snapshot (TDD regression)`. On the original implementation it failed with `AssertionError: 'OPEN' !== 'CLOSED'`: after editing the returned object, the topic store appeared to report `OPEN`.
2. **Green**: Changed `TopicUIController.getValveStates()` and `subscribeToValves()` to hand callers a shallow copy of the valve-state record, or `null` when no report is available. The failing regression then passed using a direct TypeScript-transpiled Node assertion runner. All valve state entries are scalar strings, so a shallow copy suffices.
3. **Refactor / regression**: Applied the same copy-at-controller-boundary rule to both snapshot and subscription paths; added a second regression test for subscriber mutation and unsubscription. The change does not modify the topic store, stand simulator, or reported states. Kept the type-check clean.

The test demonstrates a meaningful safety-of-display property: changing a local object is not a report from the mock stand. It is **not** a guarantee of authenticity or integrity of hardware telemetry.

## Coverage and test behavior

- **Unit:** tests cover valid/invalid stand commands, reported-mode subscriptions and cleanup, independent valve snapshots, `validateFireTiming` signed/unsigned integer boundaries, and `OperatorEventLog` ordering, bounded retention, and callbacks. Existing mode-policy tests cover transitions and SAFE exceptions.
- **System:** one test sends a valve request through the controller to the mock stand, checks its acceptance does **not** change the valve report, then checks the separate report and correlated log. Another changes a mode-entry prerequisite after the request but before mock evaluation, requiring rejection. A third confirms SAFE is available with missing telemetry and does **not** imply every valve is closed.
- **UI:** Playwright uses an explicit, deterministic development fixture containing the real React `ModeControlsModule` and `MockStandModule`, not direct React state manipulation. Tests click an Open button and the simulator's acknowledge/report buttons, verify SAFE hides manual valve controls and rejected requests do not change reported mode, and verify invalid Fire timings prevent submitting.

## Limits and future work

- `MockStand` is not a real control system. There are no hardware interlock, protocol, authentication, network, timeout, or physical feedback tests. Never interpret acceptance as proof of a physical actuation.
- Browser tests use Chromium and the test-only fixture rather than complete app login/navigation. Add end-to-end authorization and live transport contract tests when those integrations exist.
- A full test run requires native dependencies installed for the executing OS. The supplied archive included Windows-native `rolldown` dependencies, so its copied `node_modules` cannot execute Vite/Vitest on Linux; perform a clean `npm install` first.
- In CI, consider multiple browsers, accessibility checks, real connection-loss scenarios, log persistence/replay, and automated TypeScript checking (`npm run build -w @river-dash/webconsole`).
