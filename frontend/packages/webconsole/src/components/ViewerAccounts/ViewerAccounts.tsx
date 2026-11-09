import { useEffect, useState, type FormEvent } from "react";
import { createViewerAccount, type AccessRole } from "../../auth/authApi";
import styles from "./ViewerAccounts.module.css";
import { RemoteViewingControls } from "./RemoteViewingControls";

/**
 * The backend implements POST /setup for localhost account creation only.
 * It does NOT implement account listing, deletion or password reset.
 */
export function ViewerAccounts({ role, onClose }: { role: AccessRole; onClose: () => void }) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !pending) onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose, pending]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;
		if (!username.trim() || !password) {
			setError("Enter a username and password.");
			return;
		}
		if (password !== confirmation) {
			setError("The two passwords do not match.");
			return;
		}
		setPending(true);
		setError("");
		setSuccess("");
		try {
			const credentials = { username: username.trim(), password };
			await createViewerAccount(role, credentials);
			setPassword("");
			setConfirmation("");
			setSuccess(`Viewer account “${credentials.username}” created.`);
		} catch (error) {
			setError(error instanceof Error ? error.message : "Could not create the viewer account.");
		} finally {
			setPending(false);
		}
	}


	if (role !== "operator") return null;

	return (
		<div className={styles.scrim}>
			<section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="viewers-title">
				<header className={styles.heading}>
					<div>
						<p className={styles.eyebrow}>LOCAL OPERATOR ONLY</p>
						<h2 id="viewers-title">Viewer management</h2>
					</div>
					<button type="button" className={styles.close} onClick={onClose} disabled={pending}>Close</button>
				</header>
				<RemoteViewingControls />
				<h3 className={styles.accountTitle}>Create viewer account</h3>
				<form onSubmit={submit} className={styles.form}>
					<label htmlFor="viewer-username">Username</label>
					<input id="viewer-username" name="username" autoComplete="off" autoFocus value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} required maxLength={128} />
					<label htmlFor="viewer-password">Password</label>
					<input id="viewer-password" type="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required />
					<label htmlFor="viewer-confirm">Confirm password</label>
					<input id="viewer-confirm" type="password" name="confirm-password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} required />
					{error && <p role="alert" className={styles.error}>{error}</p>}
					{success && <p role="status" className={styles.success}>{success}</p>}
					<button className={styles.submit} type="submit" disabled={pending}>
						{pending ? "Creating…" : "Create account"}
					</button>
				</form>
			</section>
		</div>
	);
}
