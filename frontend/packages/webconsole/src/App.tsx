import { useCallback, useEffect, useRef, useState } from "react";
import { authEvents, getAccess, SESSION_EXPIRED_EVENT, signInViewer, signOut, type AccessRole, type Credentials } from "./auth/authApi";
import { uiController, standSimulator, operatorEvents } from "./controller/demoController";
import { ConsoleMenu } from "./components/ConsoleHeader/ConsoleMenu";
import {
	DashboardCanvas,
	type DashboardCanvasHandle,
	type ManagedModule,
} from "./components/DashboardCanvas/DashboardCanvas";
import {
	MAX_LAYOUT_IMPORT_BYTES,
	addLayoutConfiguration,
	parseImportedLayoutConfiguration,
	readLayoutConfigurations,
	serializeLayoutConfiguration,
	writeLayoutConfigurations,
} from "./layout/layoutConfigurations";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import { ViewerAccounts } from "./components/ViewerAccounts/ViewerAccounts";
import type { RepeatableModuleKind } from "./layout/dashboardLayout";
import "./App.css";

/** Existing dashboard, now available at /dashboard. */
function DashboardPage({ role, onSignOut, signingOut, signOutError }: { role: AccessRole; onSignOut: () => void; signingOut: boolean; signOutError: string }) {
	const [layoutLocked, setLayoutLocked] = useState(true);
	const isOperator = role === "operator";
	const isLocked = !isOperator || layoutLocked;
	const [resetSequence, setResetSequence] = useState(0);
	const consoleRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<DashboardCanvasHandle>(null);
	const [managedModules, setManagedModules] = useState<ManagedModule[]>([]);
	const [layoutConfigurations, setLayoutConfigurations] = useState(
		readLayoutConfigurations,
	);
	const [layoutMessage, setLayoutMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fullscreenError, setFullscreenError] = useState("");
	const [managingAccounts, setManagingAccounts] = useState(false);
	const fullscreenSupported =
		typeof document.documentElement.requestFullscreen === "function" &&
		typeof document.exitFullscreen === "function";

	// Escape and browser controls can exit fullscreen without using our button.
	useEffect(() => {
		const syncFullscreen = () => {
			setIsFullscreen(document.fullscreenElement === consoleRef.current);
			setFullscreenError("");
		};
		document.addEventListener("fullscreenchange", syncFullscreen);
		syncFullscreen();
		return () =>
			document.removeEventListener("fullscreenchange", syncFullscreen);
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
				// Do not take over fullscreen belonging to another element.
				setFullscreenError("Another element is already in fullscreen mode.");
			}
		} catch {
			setFullscreenError(
				"Fullscreen is unavailable. Check your browser permissions.",
			);
		}
	}

	function reportLayoutError(error: unknown) {
		setLayoutMessage({
			type: "error",
			text: error instanceof Error ? error.message : "Layout operation failed.",
		});
	}

	function handleSaveConfiguration(name: string): boolean {
		try {
			if (!isOperator) throw new Error("Viewer accounts cannot modify layouts.");
			const snapshot = canvasRef.current?.getLayoutSnapshot();
			if (!snapshot)
				throw new Error("The dashboard isn't ready to save a layout yet.");
			const updated = addLayoutConfiguration(
				readLayoutConfigurations(),
				name,
				snapshot,
			);
			writeLayoutConfigurations(updated);
			setLayoutConfigurations(updated);
			setLayoutMessage({
				type: "success",
				text: `Saved “${updated[updated.length - 1].name}”.`,
			});
			return true;
		} catch (error) {
			reportLayoutError(error);
			return false;
		}
	}

	function handleLoadConfiguration(id: string): boolean {
		try {
			if (!isOperator) throw new Error("Viewer accounts cannot modify layouts.");
			if (isLocked)
				throw new Error(
					"Unlock layout editing before loading a configuration.",
				);
			const configuration = readLayoutConfigurations().find(
				(item) => item.id === id,
			);
			if (!configuration)
				throw new Error("That saved layout could not be found.");
			if (!canvasRef.current)
				throw new Error("The dashboard isn't ready to load a layout yet.");
			canvasRef.current.applyLayoutSnapshot(configuration.snapshot);
			setLayoutMessage({
				type: "success",
				text: `Loaded “${configuration.name}”.`,
			});
			return true;
		} catch (error) {
			reportLayoutError(error);
			return false;
		}
	}

	function handleDeleteConfiguration(id: string): void {
		if (!isOperator) return;
		const current = readLayoutConfigurations();
		const configuration = current.find((item) => item.id === id);
		if (
			!configuration ||
			!window.confirm(`Delete saved layout “${configuration.name}”?`)
		)
			return;
		try {
			const updated = current.filter((item) => item.id !== id);
			writeLayoutConfigurations(updated);
			setLayoutConfigurations(updated);
			setLayoutMessage({
				type: "success",
				text: `Deleted “${configuration.name}”.`,
			});
		} catch (error) {
			reportLayoutError(error);
		}
	}

	function handleExportConfiguration(id: string): void {
		const configuration = layoutConfigurations.find((item) => item.id === id);
		if (!configuration) {
			reportLayoutError(new Error("That saved layout could not be found."));
			return;
		}
		const data = new Blob([serializeLayoutConfiguration(configuration)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(data);
		const link = document.createElement("a");
		link.href = url;
		link.download = `river-dash-layout-${
			configuration.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "") || "saved"
		}.json`;
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function handleImportConfiguration(file: File): Promise<void> {
		try {
			if (!isOperator) throw new Error("Viewer accounts cannot modify layouts.");
			if (file.size > MAX_LAYOUT_IMPORT_BYTES)
				throw new Error("Layout file exceeds 128 KB.");
			const { name, snapshot } = parseImportedLayoutConfiguration(
				await file.text(),
			);
			const updated = addLayoutConfiguration(
				readLayoutConfigurations(),
				name,
				snapshot,
			);
			writeLayoutConfigurations(updated);
			setLayoutConfigurations(updated);
			setLayoutMessage({
				type: "success",
				text: `Imported “${name}”. Select Load to use it.`,
			});
		} catch (error) {
			reportLayoutError(error);
		}
	}

	function handleAddModule(kind: RepeatableModuleKind): boolean {
		try {
			if (!isOperator) throw new Error("Viewer accounts cannot modify layouts.");
			if (isLocked) throw new Error("Unlock layout editing before adding modules.");
			const id = canvasRef.current?.addModule(kind);
			if (!id) throw new Error("The dashboard isn't ready to add modules yet.");
			setLayoutMessage({ type: "success", text: `Added ${kind === "graphs" ? "time series graph" : "telemetry overview"} panel.` });
			return true;
		} catch (error) {
			reportLayoutError(error);
			return false;
		}
	}

	function handleRemoveModule(id: string): boolean {
		try {
			if (!isOperator) throw new Error("Viewer accounts cannot modify layouts.");
			if (isLocked) throw new Error("Unlock layout editing before removing modules.");
			if (!canvasRef.current) throw new Error("The dashboard isn't ready to remove modules yet.");
			canvasRef.current.removeModule(id);
			setLayoutMessage({ type: "success", text: "Module removed. Use Add module to restore it." });
			return true;
		} catch (error) {
			reportLayoutError(error);
			return false;
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
				managedModules={managedModules}
				onAddModule={handleAddModule}
				onRemoveModule={handleRemoveModule}
				layoutConfigurations={layoutConfigurations}
				layoutMessage={layoutMessage}
				onSaveConfiguration={handleSaveConfiguration}
				onLoadConfiguration={handleLoadConfiguration}
				onDeleteConfiguration={handleDeleteConfiguration}
				onExportConfiguration={handleExportConfiguration}
				onImportConfiguration={handleImportConfiguration}
			/>
			<DashboardCanvas
				ref={canvasRef}
				isLocked={isLocked}
				resetSequence={resetSequence}
				onModulesChange={setManagedModules}
				controller={uiController}
				simulator={standSimulator}
				eventLog={operatorEvents}
				readOnly={!isOperator}
			/>
			{signOutError && <p className="auth-sign-out-error" role="alert">{signOutError}</p>}
			{isOperator && managingAccounts && <ViewerAccounts role={role} onClose={() => setManagingAccounts(false)} />}
		</main>
	);
}

type AuthStatus = "checking" | "unavailable" | "unauthenticated" | AccessRole;
function App() {
	const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
	const [authNotice, setAuthNotice] = useState("");
	const [signingOut, setSigningOut] = useState(false);
	const [signOutError, setSignOutError] = useState("");
	const refreshAccess = useCallback(async (expired = false) => {
		setAuthStatus("checking");
		try { const role = await getAccess(); setAuthStatus(role ?? "unauthenticated"); setAuthNotice(role ? "" : expired ? "Your viewer session expired. Sign in again." : ""); }
		catch (error) { setAuthNotice(error instanceof Error ? error.message : "Could not verify console access."); setAuthStatus("unavailable"); }
	}, []);
	useEffect(() => { void refreshAccess(); }, [refreshAccess]);
	useEffect(() => { const onExpired = () => void refreshAccess(true); authEvents.addEventListener(SESSION_EXPIRED_EVENT, onExpired); return () => authEvents.removeEventListener(SESSION_EXPIRED_EVENT, onExpired); }, [refreshAccess]);
	async function handleSignIn(credentials: Credentials) { await signInViewer(credentials); setAuthNotice(""); setAuthStatus("viewer"); }
	async function handleSignOut() { if (signingOut || authStatus !== "viewer") return; setSigningOut(true); setSignOutError(""); try { await signOut(); setAuthStatus("unauthenticated"); } catch (error) { setSignOutError(error instanceof Error ? error.message : "Sign out failed. Please try again."); } finally { setSigningOut(false); } }
	if (authStatus === "checking") return <main className="auth-checking" role="status">Checking dashboard access…</main>;
	if (authStatus === "unavailable") return <main className="auth-unavailable"><section className="auth-unavailable-panel" role="alert"><h1>Cannot verify dashboard access</h1><p>{authNotice}</p><button type="button" onClick={() => void refreshAccess()}>Retry connection</button></section></main>;
	if (authStatus === "unauthenticated") return <LoginPage onSignIn={handleSignIn} notice={authNotice} />;
	return <DashboardPage role={authStatus} onSignOut={handleSignOut} signingOut={signingOut} signOutError={signOutError} />;
}

export default App;
