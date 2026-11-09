import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extractQuickTunnelUrl, QuickTunnelManager } from "./quickTunnel.js";
import { isValidTunnelManagementRequest, tunnelManagementMiddleware } from "./tunnelManagementApi.js";

test("Quick Tunnel URL parser accepts only correct trycloudflare.com links", () => {
	assert.equal(extractQuickTunnelUrl("Your quick Tunnel: https://sas-require-yields-background.trycloudflare.com"),
		"https://sas-require-yields-background.trycloudflare.com");
	assert.equal(extractQuickTunnelUrl("https://abc.trycloudflare.com.evil.com"), null);
	assert.equal(extractQuickTunnelUrl("https://abc.trycloudfare.com"), null);
	assert.equal(extractQuickTunnelUrl("http://abc.trycloudflare.com"), null);
	assert.equal(extractQuickTunnelUrl("https://abc.trycloudflare.com.evil.net https://safe-123.trycloudflare.com"),
		"https://safe-123.trycloudflare.com");
});

type ApiTestOptions = {
	peer?: string;
	host?: string;
	origin?: string;
	managementHeader?: string;
	fetchSite?: string;
	contentType?: string;
	method?: string;
	path?: string;
};
function sendManagementRequest(options: ApiTestOptions = {}, payload = '{"enabled":true}') {
	const request = new EventEmitter() as IncomingMessage;
	request.method = options.method ?? "PUT";
	request.url = options.path ?? "/api/remote-access";
	request.headers = {
		host: options.host ?? "localhost:5173",
		origin: options.origin ?? "http://localhost:5173",
		"content-type": options.contentType ?? "application/json",
		"x-river-dash-management": options.managementHeader ?? "1",
		"sec-fetch-site": options.fetchSite ?? "same-origin",
	};
	Object.assign(request, { socket: { remoteAddress: options.peer ?? "127.0.0.1" } });
	const result = { code: 0, body: "", continued: false, enabled: null as boolean | null };
	const response = {
		writeHead(status: number) { result.code = status; return response; },
		end(body: string) { result.body = body; return response; },
	} as unknown as ServerResponse;
	const manager = {
		getStatus: () => ({ enabled: false, phase: "disabled" as const, url: null, message: null }),
		setEnabled: (enabled: boolean) => {
			result.enabled = enabled;
			return { enabled, phase: "starting" as const, url: null, message: null };
		},
	};
	tunnelManagementMiddleware(request, response, () => { result.continued = true; }, manager);
	request.emit("data", Buffer.from(payload));
	request.emit("end");
	return { request, result };
}

test("management API is restricted to same-origin localhost operator", () => {
	assert.equal(sendManagementRequest().result.code, 200);
	assert.equal(sendManagementRequest().result.enabled, true);
	assert.equal(sendManagementRequest({}, '{"enabled":false}').result.enabled, false);
	for (const options of [
		{ peer: "192.168.1.10" },
		{ host: "viewer.trycloudflare.com" },
		{ host: "127.0.0.1:4174", origin: "https://viewer.trycloudflare.com" },
		{ origin: "http://evil.example" },
		{ managementHeader: "0" },
		{ fetchSite: "cross-site" },
		{ contentType: "text/plain" },
	]) {
		assert.equal(sendManagementRequest(options).result.code, 403, JSON.stringify(options));
	}
	assert.equal(sendManagementRequest({}, '{"enabled":"yes"}').result.code, 400);
	assert.equal(sendManagementRequest({}, "not json").result.code, 400);
	assert.equal(sendManagementRequest({}, ' '.repeat(1200)).result.code, 413);
	assert.equal(sendManagementRequest({ path: "/api/configs" }).result.continued, true);
});

test("management request validation also rejects absent origin", () => {
	const { request } = sendManagementRequest();
	delete request.headers.origin;
	assert.equal(isValidTunnelManagementRequest(request), false);
});

test("manager initializes disabled; preferences persist and cleanup is independent", () => {
	const root = mkdtempSync(join(tmpdir(), "river-dash-tunnel-"));
	try {
		const controller = new QuickTunnelManager(root);
		assert.deepEqual(controller.getStatus(), { enabled: false, phase: "disabled", url: null, message: null });
		assert.equal(controller.setEnabled(false).phase, "disabled");
		controller.dispose();
		assert.equal(controller.setEnabled(true).enabled, false);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test("a missing configured executable never interrupts operator startup", async () => {
	const root = mkdtempSync(join(tmpdir(), "river-dash-missing-cloudflared-"));
	const original = process.env.RIVER_DASH_CLOUDFLARED_PATH;
	try {
		process.env.RIVER_DASH_CLOUDFLARED_PATH = join(root, "missing-cloudflared.exe");
		const controller = new QuickTunnelManager(root);
		assert.equal(controller.setEnabled(true).phase, "starting");
		await new Promise((done) => setTimeout(done, 30));
		assert.equal(controller.getStatus().phase, "error");
		assert.match(controller.getStatus().message ?? "", /cloudflared/i);
		assert.equal(controller.setEnabled(false).phase, "disabled");
		controller.dispose();
	} finally {
		if (original === undefined) delete process.env.RIVER_DASH_CLOUDFLARED_PATH;
		else process.env.RIVER_DASH_CLOUDFLARED_PATH = original;
		rmSync(root, { recursive: true, force: true });
	}
});

test("managed preview and tunnel start/stop together without affecting host", { skip: process.platform === "win32" }, async () => {
	const { mkdirSync, writeFileSync, chmodSync } = await import("node:fs");
	const root = mkdtempSync(join(tmpdir(), "river-dash-managed-process-"));
	const original = process.env.RIVER_DASH_CLOUDFLARED_PATH;
	const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
	const fakeTunnel = join(root, "fake-cloudflared");
	let controller: QuickTunnelManager | null = null;
	try {
		mkdirSync(join(root, "node_modules", "vite", "bin"), { recursive: true });
		writeFileSync(viteCli, `
import { createServer } from "node:http";
if (process.argv[2] === "build") process.exit(0);
if (process.argv[2] === "preview") createServer((req, res) => {
 res.writeHead(200, { "Content-Type": "application/json" });
 res.end(JSON.stringify({ role: "viewer" }));
}).listen(4174, "127.0.0.1");
`);
		writeFileSync(fakeTunnel, `#!/usr/bin/env node
console.error("Your quick Tunnel has been created! https://unit-test.trycloudflare.com");
setTimeout(() => console.error("Registered tunnel connection"), 15);
setInterval(() => {}, 1000);
`);
		chmodSync(fakeTunnel, 0o755);
		process.env.RIVER_DASH_CLOUDFLARED_PATH = fakeTunnel;
		controller = new QuickTunnelManager(root);
		assert.equal(controller.setEnabled(true).phase, "starting");
		let connected = false;
		for (let i = 0; i < 70; i++) {
			if (controller.getStatus().phase === "connected") { connected = true; break; }
			if (controller.getStatus().phase === "error") break;
			await new Promise((done) => setTimeout(done, 80));
		}
		assert.equal(connected, true, JSON.stringify(controller.getStatus()));
		assert.equal(controller.getStatus().url, "https://unit-test.trycloudflare.com");
		assert.equal(controller.setEnabled(false).phase, "disabled");
		assert.equal(controller.getStatus().url, null);
	} finally {
		controller?.dispose();
		if (original === undefined) delete process.env.RIVER_DASH_CLOUDFLARED_PATH;
		else process.env.RIVER_DASH_CLOUDFLARED_PATH = original;
		rmSync(root, { recursive: true, force: true });
	}
});
