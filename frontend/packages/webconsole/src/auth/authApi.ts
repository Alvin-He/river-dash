/**
 * Browser API for signing in and accessing the Rust backend through Vite.
 * The frontend gateway assigns operator or viewer roles based on the listener.
 * Viewer sessions are checked by the gateway before configuration reads,
 * and viewer write requests are rejected before reaching the backend.
 * These frontend checks are not a substitute for backend authorization.
 */
import { clearSessionToken, getSessionToken, saveSessionToken } from "./sessionToken";

export interface Credentials {
	username: string;
	password: string;
}

export type AccessRole = "operator" | "viewer";

export class AuthApiError extends Error {
	readonly status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "AuthApiError";
		this.status = status;
	}
}

export const SESSION_EXPIRED_EVENT = "session-expired";
export const authEvents = new EventTarget();

/** The frontend gateway determines the role; tunnel-viewer is always viewer. */
export async function getUiRole(signal?: AbortSignal): Promise<AccessRole> {
	let response: Response;
	try {
		response = await fetch("/api/client-role", {
			method: "GET", credentials: "same-origin", cache: "no-store", signal,
		});
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new AuthApiError("Cannot contact the frontend access gateway.");
	}
	if (!response.ok) throw new AuthApiError("The frontend access gateway is unavailable.", response.status);
	let value: unknown;
	try {
		value = await response.json();
	} catch {
		throw new AuthApiError("The frontend access gateway returned invalid data.");
	}
	if (value !== null && typeof value === "object" && "role" in value &&
		(value.role === "operator" || value.role === "viewer")) return value.role;
	throw new AuthApiError("The frontend access gateway did not identify an access role.");
}

function apiPath(path: string): string {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") ||
		path.includes("?") || path.includes("#") || path.split("/").includes("..") ||
		path.split("/").includes(".")) {
		throw new Error("API path must be a safe relative backend path");
	}
	return `/api${path}`;
}

/**
 * authRequired=false for /login and /setup; only protected calls receive the
 * browser-stored bearer token. Cookie sessions still work via credentials.
 */
async function request(
	path: string,
	options: RequestInit = {},
	authRequired = false,
): Promise<Response> {
	const url = apiPath(path);
	const headers = new Headers(options.headers);
	// Callers cannot inject arbitrary Authorization values into our API client.
	headers.delete("Authorization");
	if (authRequired) {
		const token = getSessionToken();
		if (token) headers.set("Authorization", `Bearer ${token}`);
	}
	try {
		return await fetch(url, {
			...options,
			headers,
			credentials: "include",
			cache: "no-store",
		});
	} catch (error) {
		if (options.signal?.aborted) throw error;
		throw new AuthApiError("Cannot reach the console server. Check the backend connection.");
	}
}

function invalidateSession(response: Response, notify = true): Response {
	if (response.status === 401) {
		clearSessionToken();
		if (notify) authEvents.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
	}
	return response;
}

/**
 * /configs checks both backend availability and viewer access. The gateway
 * rejects requests without a session cookie from a successful viewer login.
 * This also lets a viewer stay signed in after a page refresh.
 */
export async function getAccess(signal?: AbortSignal): Promise<AccessRole | null> {
	const role = await getUiRole(signal);
	const response = invalidateSession(
		await request("/configs", { method: "GET", signal }, true),
		false, // An initial 401 must not create an auth event loop.
	);
	if (response.status === 401) {
		if (role === "operator") {
			throw new AuthApiError("The local backend did not allow dashboard access.", 401);
		}
		return null;
	}
	if (response.status === 404 || response.status === 405) {
		throw new AuthApiError("The backend configuration endpoint is unavailable.", response.status);
	}
	if (!response.ok) {
		throw new AuthApiError("Cannot verify dashboard access.", response.status);
	}
	try {
		const body: unknown = await response.json();
		if (!Array.isArray(body)) throw new Error("Not a config list");
	} catch {
		throw new AuthApiError("The backend did not return a valid configuration list.");
	}
	return role;
}

/**
 * Existing backend: 204 + Set-Cookie, no response body.
 * Future backend: 200 JSON { token: string }, stored in sessionStorage.
 * Both schemes are supported; no assumption that the token is a JWT.
 */
export async function signIn(credentials: Credentials): Promise<void> {
	clearSessionToken(); // Prevent a previous bearer from overriding a new cookie login.
	const response = await request("/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(credentials),
	});
	if (response.status === 204) return;
	if (response.status === 200) {
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			throw new AuthApiError("The server did not return a usable login token.", 200);
		}
		if (typeof body !== "object" || body === null || !("token" in body) ||
			typeof body.token !== "string") {
			throw new AuthApiError("The login response is missing its authentication token.", 200);
		}
		try {
			saveSessionToken(body.token);
		} catch (error) {
			throw new AuthApiError(error instanceof Error ? error.message : "Cannot store login token.");
		}
		return;
	}
	if (response.status === 401) throw new AuthApiError("Incorrect username or password.", 401);
	if (response.status === 404 || response.status === 405) {
		throw new AuthApiError("Viewer sign-in is unavailable on the backend.", response.status);
	}
	throw new AuthApiError("Sign in failed. Please try again.", response.status);
}

export async function signInViewer(credentials: Credentials): Promise<void> {
	if (await getUiRole() !== "viewer") {
		throw new AuthApiError("The local operator console does not need viewer sign-in.", 403);
	}
	await signIn(credentials);
	if (await getAccess() !== "viewer") {
		throw new AuthApiError("Dashboard access was denied after sign-in.", 401);
	}
}

/** Send the token, if present, so a future token backend can revoke it. */
export async function signOut(): Promise<void> {
	const response = invalidateSession(await request("/logout", { method: "POST" }, true), false);
	if (response.status === 204 || response.status === 401) {
		clearSessionToken();
		return;
	}
	throw new AuthApiError("Could not revoke the server session. Please try again.", response.status);
}

/**
 * Local-only account provisioning is the project's equivalent of sign-up.
 * Backend POST /setup hashes the password with Argon2 and stores it in SQLite.
 * The integrated frontend gateway rejects /setup for all viewers, including tunnels.
 */
async function requireLocalOperator(role: AccessRole): Promise<void> {
	if (role !== "operator" || await getUiRole() !== "operator") {
		throw new AuthApiError("Only the local operator can create viewer accounts.", 403);
	}
	if (await getAccess() !== "operator") {
		throw new AuthApiError("Local dashboard access is no longer available.", 403);
	}
}

export async function createViewerAccount(role: AccessRole, credentials: Credentials): Promise<void> {
	await requireLocalOperator(role);
	const response = await request("/setup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(credentials),
	});
	if (response.status === 201) return;
	if (response.status === 403 || response.status === 401) {
		throw new AuthApiError("Only the local operator may create viewer accounts.", response.status);
	}
	if (response.status === 409) throw new AuthApiError("That username already exists.", 409);
	if (response.status === 404 || response.status === 405) {
		throw new AuthApiError("Account creation is unavailable on the backend.", response.status);
	}
	throw new AuthApiError("Could not create the viewer account.", response.status);
}

/** Protected read calls: always attach bearer when available, or the cookie. */
export async function readOnlyFetch(path: string, options: RequestInit = {}): Promise<Response> {
	const method = (options.method ?? "GET").toUpperCase();
	if (method !== "GET" && method !== "HEAD") {
		throw new AuthApiError("Viewer data requests are read-only.", 403);
	}
	return invalidateSession(await request(path, { ...options, method }, true));
}

/**
 * Backend exposes configuration writes but not stand command endpoints.
 * Frontend-only checks never replace server or network-level authorization.
 */
export async function operatorOnlyFetch(
	role: AccessRole,
	path: string,
	options: RequestInit,
): Promise<Response> {
	const method = options.method?.toUpperCase();
	if (!method || !["POST", "DELETE"].includes(method)) {
		throw new AuthApiError("Specify a supported configuration write method.");
	}
	if (!((method === "POST" && path === "/configs") ||
		(method === "DELETE" && /^\/configs\/[^/]+$/.test(path)))) {
		throw new AuthApiError("This backend does not expose a stand command endpoint.", 404);
	}
	await requireLocalOperator(role);
	return invalidateSession(await request(path, { ...options, method }, true));
}
