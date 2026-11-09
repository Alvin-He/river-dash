/**
 * Optional bearer-token transport for a future backend that returns
 * { token: string } on login. The current Rust backend uses a session cookie.
 *
 * sessionStorage keeps a bearer token within one browser tab and survives a
 * refresh, but it is readable by JavaScript. Never put passwords or operator
 * credentials here, and use a trusted HTTPS viewer origin in production.
 */
const SESSION_TOKEN_KEY = "river-dash.viewer-access-token";

function storage(): Storage {
	if (typeof window === "undefined") {
		throw new Error("Browser session storage is unavailable.");
	}
	return window.sessionStorage;
}

/** RFC 6750 bearer-token character set (also works for opaque tokens and JWTs). */
function validBearerToken(token: string): boolean {
	return token.length > 0 && /^[A-Za-z0-9._~+/-]+={0,}$/.test(token);
}

export function getSessionToken(): string | null {
	try {
		const token = storage().getItem(SESSION_TOKEN_KEY);
		if (token !== null && validBearerToken(token)) return token;
		if (token !== null) clearSessionToken();
	} catch {
		// A blocked storage API cannot prove that a user is authenticated.
	}
	return null;
}

export function saveSessionToken(token: string): void {
	if (!validBearerToken(token)) {
		throw new Error("The server returned an invalid authentication token.");
	}
	try {
		storage().setItem(SESSION_TOKEN_KEY, token);
	} catch {
		throw new Error("Cannot save the login token in this browser session.");
	}
}

export function clearSessionToken(): void {
	try {
		storage().removeItem(SESSION_TOKEN_KEY);
	} catch {
		// A revoked/expired token must not remain in in-memory auth state.
	}
}
