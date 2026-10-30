import { useEffect, useRef, useState } from "react";
import { canOpenDashboard, signOutOfMockSession } from "./auth/mockAuth";
import { ConsoleHeader } from "./components/ConsoleHeader/ConsoleHeader";
import { DashboardCanvas } from "./components/DashboardCanvas/DashboardCanvas";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import "./App.css";

/** Existing dashboard, now available at /dashboard. */
function DashboardPage() {
	const [isLocked, setIsLocked] = useState(false);
	const [resetSequence, setResetSequence] = useState(0);
	const consoleRef = useRef<HTMLElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fullscreenError, setFullscreenError] = useState("");
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
				// Do not take over fullscreen belonging to another element.
				setFullscreenError("Another element is already in fullscreen mode.");
			}
		} catch {
			setFullscreenError("Fullscreen is unavailable. Check your browser permissions.");
		}
	}

	function handleSignOut() {
		signOutOfMockSession();
		window.location.assign("/login");
	}

	return (
		<main ref={consoleRef} className="console">
			<ConsoleHeader
				isLocked={isLocked}
				isFullscreen={isFullscreen}
				fullscreenSupported={fullscreenSupported}
				fullscreenError={fullscreenError}
				onToggleFullscreen={handleToggleFullscreen}
				onToggleLock={() => setIsLocked((locked) => !locked)}
				onResetLayout={() => setResetSequence((value) => value + 1)}
				onSignOut={handleSignOut}
			/>
			<DashboardCanvas isLocked={isLocked} resetSequence={resetSequence} />
		</main>
	);
}

function RedirectToLogin() {
	useEffect(() => {
		window.location.replace("/login");
	}, []);

	return null;
}

function App() {
	if (window.location.pathname === "/dashboard") {
		return canOpenDashboard() ? <DashboardPage /> : <RedirectToLogin />;
	}

	if (window.location.pathname === "/login") {
		return <LoginPage />;
	}

	// The root and unknown paths start at the login page.
	return <RedirectToLogin />;
}

export default App;
