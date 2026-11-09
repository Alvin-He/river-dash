# Floating console menu

The console has no permanent top bar. `ConsoleMenu` floats in the upper-right,
with independent **Show floating icon** and **Allow icon clicks** toggles. These
settings intentionally reset on refresh. `Shift+M` toggles the dropdown even if
the icon is hidden or disabled; `Escape` and click-outside close it. Shortcut
input is ignored in editable fields.

`App.tsx` passes auth-derived role-gated callbacks. Only the local operator can
edit/reset layouts or open Viewer management; viewer sessions can sign out.
Fullscreen is available to both roles if supported. The component accepts
optional props to keep it independent of the auth API.

While Viewer management is open, `shortcutEnabled` is false so the global
shortcut will not open a second dialog behind the modal.

The separate small, always-visible `.console-operating-status` badge (App.css)
identifies simulation/no-hardware mode and the user's access role. It is not
a header and consumes no layout height.
