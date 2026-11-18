import type { TelemetryReading, TelemetryStream } from "./TelemetryModule";
import {
	demoGraphChannels,
	demoGraphStream,
} from "../time-series-graph/demoGraphStream";

/** Initial placeholders only; live demo readings come from the shared graph feed. */
export const defaultReadings: TelemetryReading[] = demoGraphChannels.map(
	({ channel, unit }) => ({
		name: channel,
		value: `— ${unit}`,
		age: "—",
	}),
);

/** The telemetry overview and charts use one demo feed, not independent random values. */
export const demoTelemetryStream: TelemetryStream = {
	subscribe(onReadings) {
		return demoGraphStream.subscribe((series) => {
			onReadings(
				series.map((entry) => ({
					name: entry.channel,
					value: `${entry.points.at(-1)?.value.toFixed(1) ?? "—"} ${entry.unit}`,
					age: "—", // Demo samples are not proof of physical sensor freshness.
				})),
			);
		});
	},
};
