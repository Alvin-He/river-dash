import { useEffect, useState } from "react";
import type { UIController } from "./UIController.ts";
import type { OperatingMode } from "./topics.ts";

/** React-specific binding. The controller itself has no React dependency. */
export function useStandMode(controller: UIController): OperatingMode | null {
	const [mode, setMode] = useState<OperatingMode | null>(() =>
		controller.getReportedMode(),
	);

	// React calls the returned unsubscribe function on unmount or controller change.
	useEffect(() => controller.subscribeToMode(setMode), [controller]);

	return mode;
}
