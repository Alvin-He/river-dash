import { BRAND_MARK_SRC } from "../../config/branding";
import styles from "./BrandMark.module.css";

/** Image shared by the dashboard header and the login page. */
export function BrandMark() {
	return <img className={styles.mark} src={BRAND_MARK_SRC} alt="" draggable={false} />;
}
