/**
 * Optional Quick Tunnel controller for the frontend host process.
 * The operator dashboard must remain usable if any part of this fails.
 * Never expose this controller's HTTP endpoints on the viewer-only listener.
 */
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ensureCloudflared } from "./cloudflaredBinary.js";

export type TunnelPhase = "disabled" | "starting" | "connected" | "error";
export type TunnelStatus = {
	enabled: boolean;
	phase: TunnelPhase;
	url: string | null;
	message: string | null;
};

type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;

const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/gi;
const CONNECTED_LINE = /Registered tunnel connection\b/i;
const MAX_DIAGNOSTIC_LENGTH = 1600;

export function extractQuickTunnelUrl(output: string): string | null {
	// Only accept Cloudflare's exact Quick Tunnel domain, never a redirected or
	// attacker-supplied public hostname. Reject adjacent hostname characters.
	for (const match of output.matchAll(QUICK_TUNNEL_URL)) {
		const next = output[match.index + match[0].length];
		if (next && /[\w.-]/.test(next)) continue;
		return match[0];
	}
	return null;
}

function diagnostic(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function executeNodeCli(
	cliPath: string,
	args: string[],
	cwd: string,
	generationValid: () => boolean,
): Promise<void> {
	return new Promise((resolveDone, reject) => {
		let finished = false;
		let output = "";
		const child = spawn(process.execPath, [cliPath, ...args], {
			cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
		});
		const collect = (chunk: Buffer) => {
			output = (output + chunk.toString("utf8")).slice(-MAX_DIAGNOSTIC_LENGTH);
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		const watchdog = setTimeout(() => {
			child.kill();
			complete(new Error("Viewer frontend build timed out."));
		}, 120_000);
		const cancelWatch = setInterval(() => { if (!generationValid()) child.kill(); }, 250);
		function complete(error?: Error) {
			if (finished) return;
			finished = true;
			clearTimeout(watchdog);
			clearInterval(cancelWatch);
			if (error) reject(error);
			else resolveDone();
		}
		child.once("error", (error) => complete(error));
		child.once("close", (code) => complete(code === 0 ? undefined : new Error(`Viewer build failed (${code ?? "unknown"}): ${output.trim()}`)));
	});
}

async function waitForViewerServer(child: ManagedChild, valid: () => boolean): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < 25_000 && valid()) {
		if (child.exitCode !== null || child.signalCode !== null) throw new Error("Viewer-only server stopped unexpectedly.");
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 700);
			let response: Response;
			try {
				response = await fetch("http://127.0.0.1:4174/api/client-role", { signal: controller.signal });
			} finally { clearTimeout(timer); }
			if (response.ok && (await response.json() as { role?: string }).role === "viewer") return;
		} catch { /* Waiting for Vite preview to accept requests. */ }
		await new Promise((done) => setTimeout(done, 250));
	}
	throw new Error(valid() ? "Viewer-only server could not start on port 4174 (check that the port is free)." : "Startup cancelled.");
}

export class QuickTunnelManager {
	private enabled = false;
	private phase: TunnelPhase = "disabled";
	private url: string | null = null;
	private message: string | null = null;
	private generation = 0;
	private viewer: ManagedChild | null = null;
	private tunnel: ManagedChild | null = null;
	private timeout: NodeJS.Timeout | null = null;
	private disposed = false;
	private readonly preferencesPath: string;

	private readonly webconsoleRoot: string;

	constructor(webconsoleRoot: string) {
		this.webconsoleRoot = webconsoleRoot;
		this.preferencesPath = resolve(webconsoleRoot, ".river-dash-state", "remote-viewing.json");
	}

	getStatus(): TunnelStatus {
		return { enabled: this.enabled, phase: this.phase, url: this.url, message: this.message };
	}

	/** Restore a saved operator preference without ever blocking startup. */
	initialize(): void {
		try {
			const settings: unknown = JSON.parse(readFileSync(this.preferencesPath, "utf8"));
			if (settings && typeof settings === "object" && "enabled" in settings && settings.enabled === true) {
				this.setEnabled(true);
			}
		} catch { /* First run or damaged preferences: remote access remains off. */ }
	}

	setEnabled(enabled: boolean): TunnelStatus {
		if (this.disposed) return this.getStatus();
		if (enabled === this.enabled && this.phase !== "error") return this.getStatus();
		this.enabled = enabled;
		this.generation += 1;
		const generation = this.generation;
		this.stopChildren();
		this.url = null;
		this.message = null;
		this.phase = enabled ? "starting" : "disabled";
		try {
			mkdirSync(dirname(this.preferencesPath), { recursive: true });
			const tmp = `${this.preferencesPath}.${process.pid}.tmp`;
			writeFileSync(tmp, JSON.stringify({ enabled }) + "\n", { mode: 0o600 });
			renameSync(tmp, this.preferencesPath);
		} catch {
			// Persistence failure must not affect local operator functionality.
			this.message = "Remote access preference could not be saved; it may reset after restart.";
		}
		if (enabled) void this.start(generation).catch((error: unknown) => {
			if (this.active(generation)) this.fail(diagnostic(error));
		});
		return this.getStatus();
	}

	private active(generation: number): boolean {
		return !this.disposed && this.enabled && generation === this.generation;
	}

	private async start(generation: number): Promise<void> {
		// Resolve first so a missing Cloudflare executable won't build or start
		// any viewer server. PATH executables are checked by spawn below.
		this.message = "Preparing Cloudflare connection…";
		const cloudflared = await ensureCloudflared(this.webconsoleRoot);
		if (!this.active(generation)) return;
		this.message = "Building viewer-only dashboard…";
		const viteCli = resolve(this.webconsoleRoot, "node_modules", "vite", "bin", "vite.js");
		const hoistedViteCli = resolve(this.webconsoleRoot, "../../node_modules/vite/bin/vite.js");
		const cli = existsSync(viteCli) ? viteCli : hoistedViteCli;
		if (!existsSync(cli)) throw new Error("Vite is missing. Run npm install from frontend/ first.");
		await executeNodeCli(cli, ["build", "--mode", "tunnel-viewer"], this.webconsoleRoot, () => this.active(generation));
		if (!this.active(generation)) return;
		this.message = "Starting viewer-only dashboard…";
		const viewer = spawn(process.execPath, [cli, "preview", "--mode", "tunnel-viewer"], {
			cwd: this.webconsoleRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
		});
		this.viewer = viewer;
		let previewError = "";
		viewer.stderr.on("data", (data: Buffer) => { previewError = (previewError + data.toString("utf8")).slice(-MAX_DIAGNOSTIC_LENGTH); });
		viewer.on("error", (error) => { if (this.active(generation)) this.fail(`Viewer frontend: ${diagnostic(error)}`); });
		viewer.on("exit", () => { if (this.active(generation)) this.fail(`Viewer-only server exited. ${previewError}`.trim()); });
		await waitForViewerServer(viewer, () => this.active(generation));
		if (!this.active(generation)) return;
		this.message = "Connecting to Cloudflare…";
		const tunnel = spawn(cloudflared, ["tunnel", "--url", "http://127.0.0.1:4174"], {
			cwd: this.webconsoleRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
		});
		this.tunnel = tunnel;
		let output = "";
		let cloudflareUrl: string | null = null;
		let registered = false;
		const onLog = (data: Buffer) => {
			if (!this.active(generation)) return;
			output = (output + data.toString("utf8")).slice(-6000);
			cloudflareUrl = cloudflareUrl ?? extractQuickTunnelUrl(output);
			if (CONNECTED_LINE.test(output)) registered = true;
			if (cloudflareUrl && registered) {
				this.phase = "connected";
				this.url = cloudflareUrl;
				this.message = null;
				if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
			}
		};
		tunnel.stdout.on("data", onLog);
		tunnel.stderr.on("data", onLog);
		tunnel.on("error", (error) => { if (this.active(generation)) this.fail(`Cannot start cloudflared: ${diagnostic(error)}. Place the executable in tools/ or set RIVER_DASH_CLOUDFLARED_PATH.`); });
		tunnel.on("exit", (code) => { if (this.active(generation)) this.fail(`Cloudflare Tunnel stopped (${code ?? "unknown"}). Verify the network connection and try enabling it again.`); });
		this.timeout = setTimeout(() => {
			if (this.active(generation) && this.phase === "starting") this.fail("Cloudflare did not establish a tunnel within 90 seconds. Check your connection and the cloudflared installation.");
		}, 90_000);
	}

	private fail(message: string): void {
		this.phase = "error";
		this.url = null;
		this.message = message;
		this.generation += 1; // ignore late child events / build completion
		this.stopChildren();
	}

	private stopChildren(): void {
		if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
		this.tunnel?.kill();
		this.tunnel = null;
		this.viewer?.kill();
		this.viewer = null;
	}

	dispose(): void {
		this.disposed = true;
		this.generation += 1;
		this.stopChildren();
	}
}
