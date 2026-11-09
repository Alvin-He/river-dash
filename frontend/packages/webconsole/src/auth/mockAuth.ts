const API_SERVER = new URL("http://10.1.0.2:3000");

let logged_in = false;
export async function signInWithMockCredentials(
	username: string,
	password: string,
): Promise<boolean> {
	const res = await fetch(new URL("./login", API_SERVER), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		credentials: "include",
		body: JSON.stringify({
			username: username,
			password: password,
		}),
	});

	if (!res.ok) return false;

	logged_in = true;
	return true;
}

export function signOutOfMockSession(): void {
	cookieStore.delete("session");
	logged_in = false;
}

export function canOpenDashboard(): boolean {
	// Only the Vite dev server allows going directly to /dashboard.
	return import.meta.env.DEV || logged_in;
}
