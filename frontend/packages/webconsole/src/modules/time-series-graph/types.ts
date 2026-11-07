export interface GraphPoint {
	timestamp: number;
	value: number;
}

export type GraphLineStyle = "solid" | "dash" | "dot" | "dash-dot";

export interface GraphSeries {
	channel: string;
	unit: string;
	color: string;
	lineStyle?: GraphLineStyle;
	points: GraphPoint[];
}

/** Browser-facing interface for the eventual backend telemetry bridge. */
export interface GraphDataStream {
	subscribe: (onSeries: (series: GraphSeries[]) => void) => () => void;
}
