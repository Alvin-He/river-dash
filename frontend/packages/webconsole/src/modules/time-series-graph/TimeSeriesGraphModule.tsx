import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { createDemoGraphSeries, demoGraphStream } from "./demoGraphStream";
import { GraphPlot } from "./GraphPlot";
import styles from "./TimeSeriesGraphModule.module.css";
import type { GraphDataStream, GraphSeries } from "./types";

interface TimeSeriesGraphModuleProps {
	series?: GraphSeries[];
	stream?: GraphDataStream;
	isGuided?: boolean;
}

export function TimeSeriesGraphModule({
	series,
	stream = demoGraphStream,
	isGuided = false,
}: TimeSeriesGraphModuleProps) {
	const [streamSeries, setStreamSeries] = useState<GraphSeries[]>(
		series ?? createDemoGraphSeries(),
	);

	useEffect(() => {
		if (!stream) {
			setStreamSeries(series ?? createDemoGraphSeries());
			return;
		}

		return stream.subscribe(setStreamSeries);
	}, [series, stream]);

	const visibleSeries = series ?? streamSeries;

	return (
		<ModuleFrame
			title="Time series graphs"
			status="live"
			statusLabel="Live"
			className={isGuided ? "snap-target" : ""}
		>
			<div className={styles.graphModule}>
				<div className={styles.toolbar}>
					<span>NUMERIC CHANNELS</span>
					<strong>{visibleSeries.length}/8 MEASUREMENTS · 60 SECOND WINDOW</strong>
				</div>
				<div className={styles.plots}>
					<GraphPlot series={visibleSeries.slice(0, 8)} />
				</div>
			</div>
		</ModuleFrame>
	);
}
