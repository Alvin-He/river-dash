import { useState, type FormEvent } from "react";
import type { Credentials } from "../../auth/authApi";
import { BrandMark } from "../../components/BrandMark/BrandMark";
import styles from "./LoginPage.module.css";

interface LoginPageProps {
	onSignIn: (credentials: Credentials) => Promise<void>;
	notice?: string;
}

export function LoginPage({ onSignIn, notice }: LoginPageProps) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [passwordVisible, setPasswordVisible] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;

		if (!username.trim() || !password) {
			setError("Enter both a username and password.");
			return;
		}

		setError("");
		setPending(true);
		try {
			await onSignIn({ username: username.trim(), password });
			setPassword("");
		} catch (error) {
			// Preserve both inputs after an unsuccessful attempt.
			setError(error instanceof Error ? error.message : "Sign in failed. Please try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<main className={`login-screen ${styles.page}`}>
			<div className={styles.center}>
				<div className={styles.brand}>
					<span className={styles.brandMark} aria-hidden="true"><BrandMark /></span>
					<div className={styles.brandText}>
						<strong>NILE CONSOLE</strong>
						<span>RIVER DASH / REMOTE VIEWER</span>
					</div>
				</div>

				<section className={styles.card} aria-labelledby="login-title">
					<div className={styles.cardHeading}>
						<p className={styles.eyebrow}>VIEW-ONLY ACCESS</p>
						<h1 id="login-title">Sign in</h1>
						<p className={styles.description}>
							Sign in with an account created by the local operator. This browser automatically joins as a view-only client; no viewer-mode setup is needed.
						</p>
					</div>

					<form onSubmit={handleSubmit} noValidate>
						<div className={styles.field}>
							<label htmlFor="login-username">Username</label>
							<input
								id="login-username"
								name="username"
								type="text"
								autoComplete="username"
								placeholder="Enter username"
								value={username}
								minLength={1}
								disabled={pending}
								onChange={(event) => {
									setUsername(event.target.value);
									setError("");
								}}
								aria-invalid={Boolean(error)}
								aria-describedby={error ? "login-error" : undefined}
								required
							/>
						</div>

						<div className={styles.field}>
							<label htmlFor="login-password">Password</label>
							<div className={styles.passwordInput}>
								<input
									id="login-password"
									name="password"
									type={passwordVisible ? "text" : "password"}
									autoComplete="current-password"
									placeholder="Enter password"
									value={password}
									disabled={pending}
									onChange={(event) => {
										setPassword(event.target.value);
										setError("");
									}}
									aria-invalid={Boolean(error)}
									aria-describedby={error ? "login-error" : undefined}
									required
								/>
								<button
									type="button"
									className={styles.passwordToggle}
									disabled={pending}
									onClick={() => setPasswordVisible((visible) => !visible)}
									aria-label={passwordVisible ? "Hide password" : "Show password"}
								>
									{passwordVisible ? "Hide" : "Show"}
								</button>
							</div>
						</div>

						{notice && !error && <p className={styles.notice} role="status">{notice}</p>}
						{error && <p id="login-error" className={styles.error} role="alert">{error}</p>}

						<button className={styles.submit} type="submit" disabled={pending}>
							{pending ? "Signing in…" : "Sign in"}
							{!pending && <span aria-hidden="true">→</span>}
						</button>
					</form>
				</section>

				<p className={styles.footer}>NILE Console · Remote monitoring access</p>
			</div>
		</main>
	);
}
