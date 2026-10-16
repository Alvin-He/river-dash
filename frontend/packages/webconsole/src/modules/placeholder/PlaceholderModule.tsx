import { ModuleFrame } from "../../components/ModuleFrame";

interface PlaceholderModuleProps {
	title: string;
	isGuided?: boolean;
}

/** Temporary module content used until each dashboard feature is implemented. */
export function PlaceholderModule({ title, isGuided = false }: PlaceholderModuleProps) {
	return (
		<ModuleFrame title={title} className={isGuided ? "snap-target" : ""}>
			<div className="placeholder">Placeholder module</div>
		</ModuleFrame>
	);
}
