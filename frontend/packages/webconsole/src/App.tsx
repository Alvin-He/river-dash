import { useCallback, useEffect, useRef, useState } from "react";
import {
	authEvents,
	getAccess,
	SESSION_EXPIRED_EVENT,
	signInViewer,
	signOut,
	type AccessRole,
	type Credentials,
} from "./auth/authApi";
import { uiController, standSimulator, operatorEvents } from "./controller/demoController";
import { useStandMode } from "./controller/useStandMode";
import { ConsoleMenu } from "./components/ConsoleHeader/ConsoleMenu";
import { DashboardCanvas } from "./components/DashboardCanvas/DashboardCanvas";
import { ViewerAccounts } from "./components/ViewerAccounts/ViewerAccounts";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import "./App.css";

type AuthStatus = "checking" | "unavailable" | "unauthenticated" | AccessRole;

function DashboardPage({
	role,
	onSignOut,
	signingOut,
	signOutError,
}: {
	role: AccessRole;
	onSignOut: () => void;
	signingOut: boolean;
	signOutError: string;
}) {
	const [layoutLocked, setLayoutLocked] = useState(true);
	const standMode = useStandMode(uiController);
	const [resetSequence, setResetSequence] = useState(0);
	const [managingAccounts, setManagingAccounts] = useState(false);
	const consoleRef = useRef<HTMLElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fullscreenError, setFullscreenError] = useState("");
	const isOperator = role === "operator";
	const isLocked = !isOperator || layoutLocked;
	const fullscreenSupported =
		typeof document.documentElement.requestFullscreen === "function" &&
		typeof document.exitFullscreen === "function";

	useEffect(() => {
		const syncFullscreen = () => {
			setIsFullscreen(document.fullscreenElement === consoleRef.current);
			setFullscreenError("");
		};
		document.addEventListener("fullscreenchange", syncFullscreen);
		syncFullscreen();
		return () => document.removeEventListener("fullscreenchange", syncFullscreen);
	}, []);

	async function handleToggleFullscreen() {
		const element = consoleRef.current;
		if (!element || !fullscreenSupported) return;
		setFullscreenError("");
		try {
			if (document.fullscreenElement === element) {
				await document.exitFullscreen();
			} else if (!document.fullscreenElement) {
				await element.requestFullscreen();
			} else {
				setFullscreenError("Another element is already in fullscreen mode.");
			}
		} catch {
			setFullscreenError("Fullscreen is unavailable. Check your browser permissions.");
		}
	}

	return (
		<main ref={consoleRef} className="console">
			<ConsoleMenu
				accessRole={role}
				isLocked={isLocked}
				isFullscreen={isFullscreen}
				fullscreenSupported={fullscreenSupported}
				fullscreenError={fullscreenError}
				onToggleFullscreen={handleToggleFullscreen}
				onToggleLock={isOperator ? () => setLayoutLocked((locked) => !locked) : undefined}
				onResetLayout={isOperator ? () => setResetSequence((value) => value + 1) : undefined}
				onManageAccounts={isOperator ? () => setManagingAccounts(true) : undefined}
				onSignOut={!isOperator ? onSignOut : undefined}
				signingOut={signingOut}
				shortcutEnabled={!managingAccounts}
			/>
			{signOutError && <p className="auth-sign-out-error" role="alert">{signOutError}</p>}
			<DashboardCanvas
				isLocked={isLocked}
				readOnly={!isOperator}
				resetSequence={resetSequence}
				controller={uiController}
				simulator={standSimulator}
				eventLog={operatorEvents}
			/>
			{/* The operational context stays visible even when the menu/icon is hidden. */}
			<div className="console-operating-status" role="status" aria-live="polite">
				<strong>{isOperator ? "LOCAL OPERATOR" : "VIEW ONLY"}</strong>
				<span>SIMULATION · NO HARDWARE</span>
				<span>MODE: {standMode ?? "UNKNOWN"}</span>
			</div>
			{isOperator && managingAccounts && (
				<ViewerAccounts role={role} onClose={() => setManagingAccounts(false)} />
			)}
		</main>
	);
}

function updatePath(path: "/login" | "/dashboard") {
	if (window.location.pathname !== path) {
		window.history.replaceState(null, "", path);
	}
}

function App() {
	const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
	const [authNotice, setAuthNotice] = useState("");
	const [signingOut, setSigningOut] = useState(false);
	const [signOutError, setSignOutError] = useState("");
	const authRevision = useRef(0);

	/** /configs checks access through the gateway, which tracks successful viewer logins. */
	const refreshAccess = useCallback(async (sessionExpired = false) => {
		const revision = ++authRevision.current;
		setAuthStatus("checking"); // suppress command UI while permissions are uncertain
		try {
			const role = await getAccess();
			if (revision !== authRevision.current) return;
			setAuthStatus(role ?? "unauthenticated");
			setAuthNotice(role ? "" : sessionExpired ? "Your viewer session expired. Sign in again." : "");
		} catch (error) {
			if (revision !== authRevision.current) return;
			setAuthNotice(error instanceof Error ? error.message : "Could not verify console access.");
			setAuthStatus("unavailable"); // fail closed instead of presenting a fake login failure
		}
	}, []);

	useEffect(() => {
		// Schedule the initial access request after the effect setup. This keeps
		// the auth state transition out of the synchronous effect phase.
		let active = true;
		queueMicrotask(() => {
			if (active) void refreshAccess();
		});
		return () => { active = false; };
	}, [refreshAccess]);

	useEffect(() => {
		const onExpired = () => void refreshAccess(true);
		authEvents.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
		return () => authEvents.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
	}, [refreshAccess]);

	// Recheck access when the page becomes visible. The gateway tracks viewer
	// logins, and the backend provides no separate session-validation route.
	useEffect(() => {
		if (authStatus !== "viewer" && authStatus !== "operator") return;
		const onResume = () => {
			if (document.visibilityState === "visible") void refreshAccess();
		};
		document.addEventListener("visibilitychange", onResume);
		return () => document.removeEventListener("visibilitychange", onResume);
	}, [authStatus, refreshAccess]);

	useEffect(() => {
		if (authStatus === "operator" || authStatus === "viewer") updatePath("/dashboard");
		if (authStatus === "unauthenticated") updatePath("/login");
	}, [authStatus]);

	async function handleSignIn(credentials: Credentials) {
		const revision = ++authRevision.current;
		await signInViewer(credentials);
		if (revision !== authRevision.current) throw new Error("Access changed during sign in. Please retry.");
		setAuthNotice("");
		setAuthStatus("viewer");
	}

	async function handleSignOut() {
		if (signingOut || authStatus !== "viewer") return;
		const revision = ++authRevision.current;
		setSigningOut(true);
		setSignOutError("");
		try {
			await signOut();
			if (revision !== authRevision.current) return;
			setAuthNotice("");
			setAuthStatus("unauthenticated");
		} catch (error) {
			setSignOutError(error instanceof Error ? error.message : "Sign out failed. Please try again.");
		} finally {
			setSigningOut(false);
		}
	}

	if (authStatus === "checking") {
		return <main className="auth-checking" role="status">Checking dashboard access…</main>;
	}
	if (authStatus === "unavailable") {
		return (
			<main className="auth-unavailable">
				<section className="auth-unavailable-panel" role="alert">
					<p className="auth-unavailable-label">DASHBOARD ACCESS UNAVAILABLE</p>
					<h1>Cannot verify dashboard access</h1>
					<p>{authNotice || "The server did not confirm access to the NILE Console configuration endpoint."}</p>
					<p>The dashboard remains unavailable until the backend responds correctly.</p>
					<button type="button" onClick={() => void refreshAccess()}>Retry connection</button>
				</section>
			</main>
		);
	}
	if (authStatus === "unauthenticated") {
		return <LoginPage onSignIn={handleSignIn} notice={authNotice} />;
	}
	return (
		<DashboardPage
			role={authStatus}
			onSignOut={handleSignOut}
			signingOut={signingOut}
			signOutError={signOutError}
		/>
	);
}

export default App;
