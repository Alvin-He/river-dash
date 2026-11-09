/**
 * Loopback-only HTTP control surface for optional remote viewing.
 * Kept separate from the tunnel process so the lifecycle can be tested
 * without constructing HTTP requests, and the viewer listener never exposes it.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { roleForRequest } from "./accessPolicy.js";
import type { QuickTunnelManager } from "./quickTunnel.js";

export function isValidTunnelManagementRequest(req: IncomingMessage): boolean {
	if (roleForRequest(req) !== "operator") return false;
	if (req.method !== "PUT") return false;
	if (req.headers["x-river-dash-management"] !== "1") return false;
	if (!/^application\/json(?:\s*;|\s*$)/i.test(req.headers["content-type"] ?? "")) return false;
	const host = req.headers.host;
	const origin = req.headers.origin;
	// The browser operator UI uses a same-origin PUT; deny absent/cross-site
	// Origin headers to avoid localhost cross-site request forgery.
	if (!host || !origin) return false;
	try {
		const parsed = new URL(origin);
		return parsed.protocol === "http:" && parsed.host.toLowerCase() === host.toLowerCase() &&
			(req.headers["sec-fetch-site"] === undefined || req.headers["sec-fetch-site"] === "same-origin");
	} catch {
		return false;
	}
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
	res.end(JSON.stringify(body));
}

/** Operator-local endpoint; checked independently of the regular API proxy. */
export function tunnelManagementMiddleware(
	req: IncomingMessage, res: ServerResponse, next: () => void,
	manager: Pick<QuickTunnelManager, "getStatus" | "setEnabled">,
): void {
	if (new URL(req.url ?? "/", "http://localhost").pathname !== "/api/remote-access") return next();
	if (roleForRequest(req) !== "operator") return sendJson(res, 403, { error: "Only the local operator can manage remote viewing." });
	if (req.method === "GET") return sendJson(res, 200, manager.getStatus());
	if (!isValidTunnelManagementRequest(req)) return sendJson(res, 403, { error: "Invalid operator request." });
	let length = 0;
	let body = "";
	let completed = false;
	const reject = (status: number, error: string) => {
		if (completed) return;
		completed = true;
		sendJson(res, status, { error });
	};
	req.on("data", (chunk: Buffer) => {
		length += chunk.length;
		if (length > 1024) return reject(413, "Request body is too large.");
		body += chunk.toString("utf8");
	});
	req.on("end", () => {
		if (completed) return;
		let parsed: unknown;
		try { parsed = JSON.parse(body); }
		catch { return reject(400, "Invalid JSON body."); }
		if (!parsed || typeof parsed !== "object" || !("enabled" in parsed) || typeof parsed.enabled !== "boolean") {
			return reject(400, "Expected { enabled: boolean }.");
		}
		completed = true;
		sendJson(res, 200, manager.setEnabled(parsed.enabled));
	});
	req.on("error", () => reject(400, "Could not read request."));
}
