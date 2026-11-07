import { ModuleFrame } from "../../components/ModuleFrame";
import styles from "./PlaceholderModule.module.css";

interface PlaceholderModuleProps {
	title: string;
	isAffected?: boolean;
}

/** Temporary module content used until each dashboard feature is implemented. */
export function PlaceholderModule({ title, isAffected = false }: PlaceholderModuleProps) {
	return (
		<ModuleFrame title={title} className={isAffected ? "affected-module" : ""}>
			<div className={styles.placeholder}>Placeholder module</div>
		</ModuleFrame>
	);
}
