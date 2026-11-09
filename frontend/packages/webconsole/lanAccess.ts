/**
 * Frontend access gateway for Vite dev and built preview.
 *
 * The Rust backend bypasses some authentication checks for loopback clients.
 * Requests proxied through Vite appear to originate on loopback, so this
 * gateway must enforce viewer permissions independently. The tunnel listener
 * always assigns the viewer role, even for local connections.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type { Plugin, ProxyOptions } from "vite";
import { normalizeDevCookies } from "./src/auth/devCookie.js";
import { QuickTunnelManager } from "./quickTunnel.js";
import { tunnelManagementMiddleware } from "./tunnelManagementApi.js";

// Preserve the public utility exports used by gateway tests and callers.
export { allowRemoteApiRequest, isLocalPeer, roleForPeer, roleForRequest } from "./accessPolicy.js";
import { allowRemoteApiRequest, roleForRequest } from "./accessPolicy.js";

// A successful Rust login returns a cookie, but its loopback bypass prevents
// the backend from independently proving authentication to this proxy. Keep a
// short-lived list of cookie hashes issued through the viewer gateway.
const viewerSessions = new Map<string, number>();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function cookieToken(rawCookies: string | undefined): string | null {
	const match = rawCookies?.match(/(?:^|;\s*)session=([^;]*)/);
	return match?.[1] || null;
}

function tokenDigest(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function viewerSessionIsKnown(req: IncomingMessage): boolean {
	const token = cookieToken(req.headers.cookie);
	if (!token) return false;
	const digest = tokenDigest(token);
	const expires = viewerSessions.get(digest);
	if (!expires) return false;
	if (expires > Date.now()) return true;
	viewerSessions.delete(digest);
	return false;
}

function rememberSuccessfulViewerLogin(
	req: IncomingMessage,
	cookies: string[] | undefined,
	viewerOnly: boolean,
): void {
	if (roleForRequest(req, viewerOnly) !== "viewer" || !cookies) return;
	const sessionCookie = cookies.find((cookie) => /^session=/i.test(cookie));
	const token = cookieToken(sessionCookie);
	if (token) viewerSessions.set(tokenDigest(token), Date.now() + SESSION_DURATION_MS);
}

/** Runs ahead of Vite's /api proxy for dev and preview. */
export function lanAccessMiddleware(
	req: IncomingMessage,
	res: ServerResponse,
	next: () => void,
	viewerOnly = false,
): void {
	const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
	const method = req.method ?? "GET";
	const role = roleForRequest(req, viewerOnly);
	if (pathname === "/api/client-role") {
		res.setHeader("Cache-Control", "no-store");
		if (method !== "GET") {
			res.writeHead(405, { Allow: "GET" }).end();
			return;
		}
		res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ role }));
		return;
	}
	if (pathname.startsWith("/api/") || pathname === "/api") {
		if (role === "viewer") {
			if (!allowRemoteApiRequest(method, pathname)) {
				res.writeHead(403, {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store",
				}).end(JSON.stringify({ error: "Viewer access is read-only." }));
				return;
			}
			if ((method === "GET" || method === "HEAD") && !viewerSessionIsKnown(req)) {
				res.writeHead(401, {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store",
				}).end(JSON.stringify({ error: "Sign in to view dashboard data." }));
				return;
			}
			if (method === "POST" && pathname === "/api/logout") {
				const token = cookieToken(req.headers.cookie);
				if (token) viewerSessions.delete(tokenDigest(token));
			}
		}
	}
	next();
}

/** Proxy frontend API requests to the local Rust backend. */
export function createBackendProxy(viewerOnly = false): ProxyOptions {
	return {
		target: process.env.RIVER_DASH_BACKEND_URL ?? "http://127.0.0.1:3000",
		changeOrigin: true,
		rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, ""),
		configure: (proxy) => {
			proxy.on("proxyRes", (proxyRes, req) => {
				// Vite rewrites /api/login to /login before proxyRes fires.
				const cookies = proxyRes.headers["set-cookie"];
				if (Array.isArray(cookies)) {
					if (req.method === "POST" &&
						new URL(req.url ?? "/", "http://localhost").pathname === "/login" &&
						proxyRes.statusCode === 204) {
						rememberSuccessfulViewerLogin(req, cookies, viewerOnly);
					}
					proxyRes.headers["set-cookie"] = normalizeDevCookies(cookies, viewerOnly);
				}
			});
		},
	};
}

export const backendProxy = createBackendProxy();

export function lanAccessPlugin(viewerOnly = false): Plugin {
	// Each Vite host (dev or preview) owns its optional tunnel lifecycle.
	// Building the viewer bundle never starts a tunnel. A dedicated viewer
	// listener deliberately does not attach management endpoints.
	const manager = viewerOnly ? null : new QuickTunnelManager(process.cwd());
	return {
		name: "river-dash-frontend-access",
		configureServer(server) {
			if (manager) {
				manager.initialize();
				server.middlewares.use((req, res, next) => tunnelManagementMiddleware(req, res, next, manager));
				server.httpServer?.once("close", () => manager.dispose());
			}
			server.middlewares.use((req, res, next) => lanAccessMiddleware(req, res, next, viewerOnly));
		},
		configurePreviewServer(server) {
			if (manager) {
				manager.initialize();
				server.middlewares.use((req, res, next) => tunnelManagementMiddleware(req, res, next, manager));
				server.httpServer.once("close", () => manager.dispose());
			}
			server.middlewares.use((req, res, next) => lanAccessMiddleware(req, res, next, viewerOnly));
		},
	};
}
