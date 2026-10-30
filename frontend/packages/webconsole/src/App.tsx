import { useEffect, useState } from "react";
import { canOpenDashboard, signOutOfMockSession } from "./auth/mockAuth";
import { ConsoleHeader } from "./components/ConsoleHeader/ConsoleHeader";
import { DashboardCanvas } from "./components/DashboardCanvas/DashboardCanvas";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import "./App.css";

/** Existing dashboard, now available at /dashboard. */
function DashboardPage() {
	const [isLocked, setIsLocked] = useState(false);
	const [resetSequence, setResetSequence] = useState(0);

	function handleSignOut() {
		signOutOfMockSession();
		window.location.assign("/login");
	}

	return (
		<main className="console">
			<ConsoleHeader
				isLocked={isLocked}
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
