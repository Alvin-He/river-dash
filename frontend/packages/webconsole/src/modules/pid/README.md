# Initial RiverDash viewer handoff

This is a predefined sample P&ID for an initial host integration, not a complete
editor or a hardware-approved layout. All telemetry bindings remain demo values.

## Files and installation

Build from DE-Nile's root:

```sh
npm run build
npm pack --workspace=@de-nile/pid-viewer --pack-destination /absolute/path/to/handoff
```

In RiverDash's frontend workspace, install the resulting tarball:

```sh
npm install /absolute/path/to/handoff/de-nile-pid-viewer-0.1.1.tgz
```

The package is not published to npm. It expects React and React DOM 19.2 or
compatible 19.x versions satisfying its peer dependencies. React Flow is included
as a dependency. No CDN or additional authentication backend is needed to embed
the read-only viewer. Build RiverDash's GDT package according to its own README.

Add `DiagramPanel.tsx` to a host module and mount it in RiverDash's existing panel
system. Give the containing panel an actual height. The example uses RiverDash's
existing `GDT` singleton and `"R"` read mode; DE-Nile creates no table or network
connection. RiverDash owns transport initialization and server configuration.

## Sample diagram and telemetry contract

`@de-nile/pid-viewer/team-example` contains Valerie's current 10-component,
9-pipe layout with IDs, labels, positions, named endpoints, colors and widths.
Use `presentation="symbols"` to render the original symbol geometry.
The default card presentation remains supported for older examples.

Copy the sample JSON to a host-owned configuration before changing bindings:

| Equipment ID | Placeholder topic | Placeholder data |
| --- | --- | --- |
| pressure-transducer1 | demo.pressure.pt101 | number, kPa, 1 decimal |
| pressure-transducer2 | demo.pressure.pt201 | number, kPa, 1 decimal |
| pneumatic-valve1 | demo.valve.pv101 | string: open / closed |
| pneumatic-valve2 | demo.valve.pv201 | string: open / closed |

These are not real topic names or confirmed units/state meanings. Unbound tanks
use neutral artwork; the standalone editor's static full/half examples are not
presented as real readings. Valve artwork is explicitly mapped in each binding's
`states[].visualState`. Keep this mapping in sync with agreed values. For compound
GDT values, provide a host decoder as described in the package README.

Missing topics display Unavailable; a cached value has freshness unconfirmed.
Five seconds without updates produces Stale. New updates restore the reading.
This detects update silence, not the age of a sensor sample or proof of disconnect.

## Checks before using real telemetry

1. Confirm the layout and actual topic names, value types, units, and state meanings.
2. Mount the viewer and check labels, nine pipes, resize, pan and zoom.
3. Feed known values through the host GDT, including zero and both valve states.
4. Stop updates for five seconds, then resume and check recovery.
5. Remove/reopen the panel and verify subscriptions are cleaned up.

Local preview: run DE-Nile's frontend and open
`/?viewerDemo=1&packageDemo=1`, then Continue as viewer. This uses the actual
package component and a simulator with pause/off controls. It does not need the
authentication backend. The original demo remains at `/?viewerDemo=1`.

The adapter was checked against RiverDash `main` ab02a58 and `global_data_table`
b1bac85 (both package version 1.0.0), using real classes and local fake publishers.
Those checks do not verify a live WebSocket server or final telemetry semantics.
Save/import UI, multiple-diagram management, and per-diagram access are separate
work and are not required to mount this sample viewer.
