import { ModuleFrame } from "../../components/ModuleFrame";

interface PlaceholderModuleProps {
	title: string;
	isAffected?: boolean;
}

/** Temporary module content used until each dashboard feature is implemented. */
export function PlaceholderModule({ title, isAffected = false }: PlaceholderModuleProps) {
	return (
		<ModuleFrame title={title} className={isAffected ? "affected-module" : ""}>
			<div className="placeholder">Placeholder module</div>
		</ModuleFrame>
	);
}
