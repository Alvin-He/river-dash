/**
 * Pure access decisions shared by the normal frontend and the viewer gateway.
 * These functions do not depend on Vite, Cloudflare, or the Rust backend.
 *
 * The local operator role is a development convenience, not authentication
 * suitable for exposing stand controls to the public internet.
 */
import type { IncomingMessage } from "node:http";

export type BrowserRole = "operator" | "viewer";

/** Use actual TCP peers, not user-provided X-Forwarded-For addresses. */
export function isLocalPeer(address: string | undefined): boolean {
	if (!address) return false;
	const normalized = address.toLowerCase();
	if (normalized === "::1") return true;
	const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
	const parts = ipv4.split(".");
	return parts.length === 4 && parts[0] === "127" &&
		parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function roleForPeer(address: string | undefined): BrowserRole {
	return isLocalPeer(address) ? "operator" : "viewer";
}

/**
 * Tunnel connections also arrive from localhost. Restrict the regular listener
 * to local Host headers for operator access, and downgrade Cloudflare requests
 * regardless of their peer/Host (defense in depth for a misrouted tunnel).
 * The dedicated tunnel listener does not depend on these heuristics at all.
 */
export function roleForRequest(req: IncomingMessage, viewerOnly = false): BrowserRole {
	if (viewerOnly) return "viewer";
	if (!isLocalPeer(req.socket.remoteAddress)) return "viewer";
	if (req.headers["cf-ray"] || req.headers["cf-connecting-ip"]) return "viewer";
	const host = (req.headers.host ?? "").toLowerCase();
	if (!/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?$/.test(host)) return "viewer";
	return "operator";
}

/** An explicit allowlist; no forwarding of viewer mutation endpoints. */
export function allowRemoteApiRequest(method: string, pathname: string): boolean {
	if (method === "POST" && (pathname === "/api/login" || pathname === "/api/logout")) {
		return true;
	}
	if ((method === "GET" || method === "HEAD") &&
		(pathname === "/api/configs" || /^\/api\/configs\/[^/]+$/.test(pathname))) {
		return true;
	}
	return false;
}
