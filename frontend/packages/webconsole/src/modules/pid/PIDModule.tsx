import { ModuleFrame } from "../../components/ModuleFrame";
import { DiagramPanel } from "./DiagramPanel";

interface PIDModuleProps {
	title: string;
	isAffected?: boolean;
}

export function PIDModule({
	title,
	isAffected = false,
}: PIDModuleProps) {
	return (
		<ModuleFrame title={title} className={isAffected ? "affected-module" : ""}>
			<DiagramPanel></DiagramPanel>
		</ModuleFrame>
	);
}
