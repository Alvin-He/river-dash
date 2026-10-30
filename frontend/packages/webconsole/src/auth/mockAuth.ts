/**
 * Temporary FRONTEND-ONLY authentication for UI development.
 * This is NOT a security boundary. Replace it with server-side authentication
 * and authorization before connecting the console to real stand controls.
 */
export const MOCK_CREDENTIALS = {
	username: "operator",
	password: "riverdash123",
} as const;

const MOCK_SESSION_KEY = "river-dash-mock-session";

export function signInWithMockCredentials(username: string, password: string): boolean {
	if (
		username !== MOCK_CREDENTIALS.username ||
		password !== MOCK_CREDENTIALS.password
	) {
		return false;
	}

	sessionStorage.setItem(MOCK_SESSION_KEY, "signed-in");
	return true;
}

export function signOutOfMockSession(): void {
	sessionStorage.removeItem(MOCK_SESSION_KEY);
}

export function canOpenDashboard(): boolean {
	// Only the Vite dev server allows going directly to /dashboard.
	return import.meta.env.DEV || sessionStorage.getItem(MOCK_SESSION_KEY) === "signed-in";
}
