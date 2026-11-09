import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	allowRemoteApiRequest,
	backendProxy,
	createBackendProxy,
	isLocalPeer,
	lanAccessMiddleware,
	roleForPeer,
	roleForRequest,
} from "./lanAccess.js";

test("TCP peers are classified without trusting forwarded IPs", () => {
	for (const address of ["127.0.0.1", "127.25.0.1", "::1", "::ffff:127.0.0.1"]) {
		assert.equal(isLocalPeer(address), true);
		assert.equal(roleForPeer(address), "operator");
	}
	for (const address of [undefined, "192.168.1.50", "10.0.0.5", "::ffff:10.0.0.5", "8.8.8.8", "127.bad.0.1"]) {
		assert.equal(isLocalPeer(address), false);
		assert.equal(roleForPeer(address), "viewer");
	}
});

test("viewer API allowlist blocks backend mutations", () => {
	assert.equal(allowRemoteApiRequest("POST", "/api/login"), true);
	assert.equal(allowRemoteApiRequest("POST", "/api/logout"), true);
	assert.equal(allowRemoteApiRequest("GET", "/api/configs"), true);
	assert.equal(allowRemoteApiRequest("GET", "/api/configs/demo"), true);
	assert.equal(allowRemoteApiRequest("HEAD", "/api/configs/demo"), true);
	for (const [method, path] of [["POST", "/api/setup"], ["POST", "/api/configs"],
		["DELETE", "/api/configs/demo"], ["PUT", "/api/configs"],
		["GET", "/api/setup"], ["GET", "/api/configs/demo/extras"],
		["POST", "/api/client-role"]]) {
		assert.equal(allowRemoteApiRequest(method, path), false, `${method} ${path}`);
	}
});

type CallOptions = {
	remote?: string;
	cookie?: string;
	host?: string;
	cloudflare?: boolean;
	viewerOnly?: boolean;
};

function callGateway(path: string, method: string, options: CallOptions = {}) {
	let status = 0;
	let body = "";
	let continued = false;
	const headers: Record<string, string> = {};
	const req = {
		url: path,
		method,
		headers: {
			cookie: options.cookie,
			host: options.host ?? "127.0.0.1:5173",
			"x-forwarded-for": "127.0.0.1",
			...(options.cloudflare ? { "cf-ray": "fake-ray", "cf-connecting-ip": "203.0.113.33" } : {}),
		},
		socket: { remoteAddress: options.remote ?? "127.0.0.1" },
	} as unknown as IncomingMessage;
	const res = {
		setHeader: (name: string, value: string) => { headers[name] = value; },
		writeHead: (code: number, values?: Record<string, string>) => {
			status = code;
			Object.assign(headers, values);
			return res;
		},
		end: (data?: string) => { body = data ?? ""; return res; },
	} as unknown as ServerResponse;
	lanAccessMiddleware(req, res, () => { continued = true; }, options.viewerOnly);
	return { status, body, continued, headers, req };
}

test("LAN operator stays local; normal remote clients are viewers", () => {
	assert.equal(JSON.parse(callGateway("/api/client-role", "GET").body).role, "operator");
	assert.equal(JSON.parse(callGateway("/api/client-role", "GET", { remote: "192.168.1.25" }).body).role, "viewer");
	assert.equal(callGateway("/api/client-role", "POST", { remote: "192.168.1.25" }).status, 405);
	assert.equal(callGateway("/api/setup", "POST").continued, true);
	assert.equal(callGateway("/api/setup", "POST", { remote: "192.168.1.25" }).status, 403);
	assert.equal(callGateway("/dashboard", "GET", { remote: "192.168.1.25" }).continued, true);
});

test("tunnel viewer mode cannot become operator even through localhost", () => {
	for (const options of [
		{ viewerOnly: true, host: "127.0.0.1:4174" },
		{ viewerOnly: true, host: "public.trycloudflare.com" },
		{ viewerOnly: true, cloudflare: true },
	]) {
		const role = callGateway("/api/client-role", "GET", options);
		assert.equal(JSON.parse(role.body).role, "viewer");
		assert.equal(callGateway("/api/setup", "POST", options).status, 403);
		assert.equal(callGateway("/api/configs", "POST", options).status, 403);
		assert.equal(callGateway("/api/configs/name", "DELETE", options).status, 403);
		assert.equal(callGateway("/api/configs", "GET", options).status, 401);
		assert.equal(callGateway("/api/login", "POST", options).continued, true);
	}
});

test("Cloudflare headers or a public Host downgrade even a wrong-port tunnel", () => {
	for (const options of [
		{ cloudflare: true },
		{ host: "public.trycloudflare.com" },
		{ host: "somewhere.example.org" },
	]) {
		const req = callGateway("/api/client-role", "GET", options).req;
		assert.equal(roleForRequest(req), "viewer");
		assert.equal(callGateway("/api/setup", "POST", options).status, 403);
	}
	assert.equal(roleForRequest(callGateway("/api/client-role", "GET").req), "operator");
});

function simulateLogin(
	proxyOptions: ReturnType<typeof createBackendProxy>,
	loginRequest: IncomingMessage,
	statusCode: number,
) {
	const hook: { listener?: (response: {
		statusCode: number;
		headers: { "set-cookie"?: string[] };
	}, request: IncomingMessage) => void } = {};
	const proxy = { on: (_event: string, listener: NonNullable<typeof hook.listener>) => { hook.listener = listener; } };
	proxyOptions.configure?.(proxy as never, proxyOptions);
	assert.ok(hook.listener);
	loginRequest.url = proxyOptions.rewrite?.(loginRequest.url ?? "");
	assert.equal(loginRequest.url, "/login");
	const loginResponse = { statusCode, headers: { "set-cookie": [`session=test-token-${statusCode}; Path=/; SameSite=None`] } };
	hook.listener?.(loginResponse, loginRequest);
	return loginResponse.headers["set-cookie"][0];
}

test("LAN viewer login survives page refresh and logout invalidates it", () => {
	const remote = "192.168.1.25";
	assert.equal(callGateway("/api/configs", "GET", { remote }).status, 401);
	assert.equal(callGateway("/api/configs", "GET", { remote, cookie: "session=unissued" }).status, 401);
	assert.equal(callGateway("/api/configs", "GET").continued, true);
	const loginRequest = callGateway("/api/login", "POST", { remote });
	assert.equal(loginRequest.continued, true);
	const cookie = simulateLogin(backendProxy, loginRequest.req, 204);
	assert.match(cookie, /SameSite=Lax/);
	assert.match(cookie, /HttpOnly/);
	assert.doesNotMatch(cookie, /; Secure/);
	assert.equal(callGateway("/api/configs", "GET", { remote, cookie: "session=test-token-204" }).continued, true);
	assert.equal(callGateway("/api/configs", "GET", { remote, cookie: "session=wrong" }).status, 401);
	assert.equal(callGateway("/api/logout", "POST", { remote, cookie: "session=test-token-204" }).continued, true);
	assert.equal(callGateway("/api/configs", "GET", { remote, cookie: "session=test-token-204" }).status, 401);
});

test("tunnel login registers loopback viewer and issues Secure cookies", () => {
	const options = { viewerOnly: true, host: "some-name.trycloudflare.com" };
	const token = "session=test-token-204";
	assert.equal(callGateway("/api/configs", "GET", options).status, 401);
	const loginReq = callGateway("/api/login", "POST", options).req;
	const cookie = simulateLogin(createBackendProxy(true), loginReq, 204);
	assert.match(cookie, /SameSite=Lax/);
	assert.match(cookie, /HttpOnly/);
	assert.match(cookie, /; Secure/);
	assert.equal(callGateway("/api/configs", "GET", { ...options, cookie: token }).continued, true);
	assert.equal(callGateway("/api/setup", "POST", { ...options, cookie: token }).status, 403);
	assert.equal(callGateway("/api/configs", "POST", { ...options, cookie: token }).status, 403);
	assert.equal(callGateway("/api/logout", "POST", { ...options, cookie: token }).continued, true);
	assert.equal(callGateway("/api/configs", "GET", { ...options, cookie: token }).status, 401);
});

test("a failed viewer login cannot register a session", () => {
	const options = { viewerOnly: true };
	const req = callGateway("/api/login", "POST", options).req;
	simulateLogin(createBackendProxy(true), req, 401);
	assert.equal(callGateway("/api/configs", "GET", { ...options, cookie: "session=test-token-401" }).status, 401);
});
