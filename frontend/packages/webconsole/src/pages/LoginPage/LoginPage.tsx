import { useState, type SubmitEvent } from "react";
import { signInWithMockCredentials } from "../../auth/mockAuth";
import { BrandMark } from "../../components/BrandMark/BrandMark";
import styles from "./LoginPage.module.css";

export function LoginPage() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [passwordVisible, setPasswordVisible] = useState(true);
	const [error, setError] = useState("");

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();

		if (await signInWithMockCredentials(username, password)) {
			window.location.assign("/dashboard");
			return;
		}

		// Do not clear either input on an unsuccessful attempt.
		setError("Incorrect username or password. Please try again.");
	}

	return (
		<main className={`login-screen ${styles.page}`}>
			<div className={styles.center}>
				<div className={styles.brand}>
					<span className={styles.brandMark} aria-hidden="true">
						<BrandMark />
					</span>
					<div className={styles.brandText}>
						<strong>NILE CONSOLE</strong>
						<span>RIVER DASH / OPERATOR INTERFACE</span>
					</div>
				</div>

				<section className={styles.card} aria-labelledby="login-title">
					<div className={styles.cardHeading}>
						<p className={styles.eyebrow}>CONSOLE ACCESS</p>
						<h1 id="login-title">Sign in</h1>
						<p className={styles.description}>
							Enter your credentials to open the test stand dashboard.
						</p>
					</div>

					<form onSubmit={(e) => handleSubmit(e)} noValidate>
						<div className={styles.field}>
							<label htmlFor="login-username">Username</label>
							<input
								id="login-username"
								name="username"
								type="text"
								autoComplete="username"
								placeholder="Enter username"
								value={username}
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
									onClick={() => setPasswordVisible((visible) => !visible)}
									aria-label={
										passwordVisible ? "Hide password" : "Show password"
									}
								>
									{passwordVisible ? "Hide" : "Show"}
								</button>
							</div>
						</div>

						{error && (
							<p id="login-error" className={styles.error} role="alert">
								{error}
							</p>
						)}

						<button className={styles.submit} type="submit">
							Sign in <span aria-hidden="true">→</span>
						</button>
					</form>
				</section>

				{import.meta.env.DEV && (
					<div className={styles.devPanel}>
						<div className={styles.devHeader}>
							<span className={styles.devDot} aria-hidden="true" />
							<strong>Development mode</strong>
						</div>
						<a href="/dashboard">Open dashboard without signing in →</a>
					</div>
				)}

				<p className={styles.footer}>
					NILE Console · Mock authentication for development
				</p>
			</div>
		</main>
	);
}
