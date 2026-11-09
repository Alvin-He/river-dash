import { ModuleFrame } from "../../components/ModuleFrame";
import styles from "./PlaceholderModule.module.css";

interface PlaceholderModuleProps {
	title: string;
	isAffected?: boolean;
	message?: string;
}

/** Temporary module content used until each dashboard feature is implemented. */
export function PlaceholderModule({ title, isAffected = false, message }: PlaceholderModuleProps) {
	return (
		<ModuleFrame title={title} className={isAffected ? "affected-module" : ""}>
			<div className={styles.placeholder}>{message ?? "Placeholder module"}</div>
		</ModuleFrame>
	);
}
