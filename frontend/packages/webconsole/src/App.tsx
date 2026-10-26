import { useState } from "react";
import { ConsoleHeader } from "./components/ConsoleHeader/ConsoleHeader";
import { DashboardCanvas } from "./components/DashboardCanvas/DashboardCanvas";
import "./App.css";

/** App-level shell: the lock setting is shared by the header and canvas. */
function App() {
	const [isLocked, setIsLocked] = useState(false);

	return (
		<main className="console">
			<ConsoleHeader
				isLocked={isLocked}
				onToggleLock={() => setIsLocked((locked) => !locked)}
			/>
			<DashboardCanvas isLocked={isLocked} />
		</main>
	);
}

export default App;
