import { useEffect, useState } from "react";
import { getRemoteAccessStatus, setRemoteAccessEnabled, type RemoteAccessStatus } from "./remoteAccessApi";
import styles from "./ViewerAccounts.module.css";

/** Display progress and failures, but avoid redundant connected/disabled labels. */
function statusMessage(status: RemoteAccessStatus | null): string | null {
	if (!status || status.phase === "disabled" || status.phase === "connected") return null;
	if (status.phase === "starting") return status.message || "Connecting to Cloudflare…";
	return status.message || "Remote viewing unavailable";
}

/** Optional remote-access controls; independent of viewer account creation. */
export function RemoteViewingControls() {
	const [remoteStatus, setRemoteStatus] = useState<RemoteAccessStatus | null>(null);
	const [remoteError, setRemoteError] = useState("");
	const [remotePending, setRemotePending] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let active = true;
		async function refresh() {
			try {
				const status = await getRemoteAccessStatus();
				if (active) { setRemoteStatus(status); setRemoteError(""); }
			} catch (error) {
				if (active) setRemoteError(error instanceof Error ? error.message : "Cannot contact the tunnel manager.");
			}
		}
		void refresh();
		const timer = window.setInterval(() => void refresh(), 2000);
		return () => { active = false; window.clearInterval(timer); };
	}, []);

	async function changeRemoteAccess(enabled: boolean) {
		if (remotePending) return;
		setRemotePending(true);
		setRemoteError("");
		setCopied(false);
		try { setRemoteStatus(await setRemoteAccessEnabled(enabled)); }
		catch (error) { setRemoteError(error instanceof Error ? error.message : "Could not update remote access."); }
		finally { setRemotePending(false); }
	}

	async function copyViewerLink() {
		if (!remoteStatus?.url) return;
		try {
			await navigator.clipboard.writeText(remoteStatus.url);
			setCopied(true);
		} catch { setRemoteError("Could not copy automatically. Select the link and copy it manually."); }
	}

	const remoteMessage = remoteError || statusMessage(remoteStatus);
	const remoteMessageIsError = Boolean(remoteError || remoteStatus?.phase === "error");

	return (
		<section className={styles.remote} aria-labelledby="remote-title">
			<div className={styles.remoteHeading}>
				<h3 id="remote-title">Remote viewing</h3>
				<button
					type="button"
					className={styles.remoteToggle}
					aria-pressed={remoteStatus?.enabled ?? false}
					disabled={remotePending || remoteStatus === null}
					onClick={() => void changeRemoteAccess(!remoteStatus?.enabled)}
				>
					{remoteStatus?.enabled ? "Disable" : "Enable"}
				</button>
			</div>
			{remoteMessage && (
				<div
					className={`${styles.remoteStatus}${remoteMessageIsError ? ` ${styles.error}` : ""}`}
					role={remoteMessageIsError ? "alert" : "status"}
					aria-live={remoteMessageIsError ? "assertive" : "polite"}
				>
					{remoteMessage}
				</div>
			)}
			{remoteStatus?.phase === "connected" && remoteStatus.url && (
				<div className={styles.remoteShare}>
					<label htmlFor="remote-viewer-url">Viewer link (temporary)</label>
					<div className={styles.remoteShareRow}>
						<input id="remote-viewer-url" type="text" readOnly value={remoteStatus.url} onFocus={(event) => event.target.select()} />
						<button type="button" className={styles.copyLink} onClick={() => void copyViewerLink()}>
							{copied ? "Copied" : "Copy link"}
						</button>
					</div>
				</div>
			)}
			<p className={styles.remoteNote}>
				Quick Tunnel links change whenever the tunnel restarts. Only the viewer-only dashboard is shared;
				the local operator is unaffected if remote access fails.
			</p>
		</section>
	);
}
