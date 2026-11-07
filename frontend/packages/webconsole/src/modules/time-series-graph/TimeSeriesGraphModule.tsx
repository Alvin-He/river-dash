import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { createDemoGraphSeries, demoGraphStream } from "./demoGraphStream";
import { GraphPlot } from "./GraphPlot";
import styles from "./TimeSeriesGraphModule.module.css";
import type { GraphDataStream, GraphSeries } from "./types";

interface TimeSeriesGraphModuleProps {
	series?: GraphSeries[];
	stream?: GraphDataStream;
	isAffected?: boolean;
}

export function TimeSeriesGraphModule({
	series,
	stream = demoGraphStream,
	isAffected = false,
}: TimeSeriesGraphModuleProps) {
	const [streamSeries, setStreamSeries] = useState<GraphSeries[]>(
		series ?? createDemoGraphSeries(),
	);

	useEffect(() => {
		return stream?.subscribe(setStreamSeries);
	}, [stream]);

	const visibleSeries = series ?? streamSeries;

	return (
		<ModuleFrame
			title="Time series graphs"
			status="live"
			statusLabel="Live"
			className={isAffected ? "affected-module" : ""}
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
