# Floating console menu

`ConsoleMenu` replaces the old `ConsoleHeader`. It is an absolutely positioned
sibling of `DashboardCanvas` inside `.console`. **There is no top bar and no
reserved header height**; the dashboard surface uses the entire viewport.
The trigger sits in the upper-right corner and the menu overlays, rather than
reflows, draggable modules.

## Operator interactions

- Click the floating icon, or press **Shift+M**, to open/close the menu.
- Press **Escape** or click outside to close it. Escape is not prevented, so
  browsers can still exit fullscreen normally.
- `Shift+M` is ignored while typing in a text field or editable element.
- The **Show floating icon** and **Allow icon clicks** checkboxes are
  independent. Both default to enabled and reset on page reload. If either or
  both are disabled, **Shift+M still opens the menu**, so it cannot become
  permanently inaccessible.
- Layout reset remains disabled while layout editing is locked. Fullscreen
  remains disabled when unsupported by the browser.

## Auth branch integration

The menu does not import authentication or controller code. `App.tsx` in the UI
branch passes the existing layout, fullscreen, and mock sign-out callbacks.
When bringing the auth branch forward, pass these optional props:

- `accessRole="viewer" | "operator"`: hides layout editing and account
  management for view-only sessions.
- `onManageAccounts`: adds **Viewer management** for operators only.
- `onSignOut`, `signingOut`: shows the existing sign-out action (supply only
  where the auth branch allows sign-out).
- `statusLabel`: displays an authoritative, noninteractive status label in
  the menu. **Actual hardware mode, safety status, and critical warnings
  should also stay persistently visible in a dedicated status surface, not
  solely in this menu.**

Do not restore the old `LIVE · 24.8 Hz` string: it was hardcoded in the UI
branch and does not represent verified telemetry. Likewise, `Shift+M` must not
interfere with operator text inputs, and presentation-level role checks do
not replace server-side authorization.

## Saved layouts

The **Saved layouts** group appears when optional `onSaveConfiguration` and
`onLoadConfiguration` callbacks are supplied for a non-viewer session. An
operator can enter a name, save the currently committed geometry, load a named
configuration (only when unlocked), download JSON, import JSON, or delete a
preset. The menu itself does not access browser storage, import geometry, or
assume an authentication scheme: `App.tsx` supplies those operations via
`layoutConfigurations.ts` and `DashboardCanvas`'s imperative layout handle.

`layoutConfigurations` and `layoutMessage` display saved items and feedback;
`onDeleteConfiguration`, `onExportConfiguration`, and `onImportConfiguration`
are optional. Viewers do not see these controls. Client-side hiding is a UI
measure only; a future auth-enabled implementation must separately enforce
appropriate authorization and scope stored layouts to accounts if required.
