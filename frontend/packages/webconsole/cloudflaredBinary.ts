/** Optional, explicit-enable download for the Windows x64 hosting machine. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

// Use a fixed upstream version so the downloaded executable can be verified.
// Update the version and SHA-256 digest together when upgrading cloudflared.
const VERSION = "2026.10.7";
const WINDOWS_X64_SHA256 = "2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343";
const DOWNLOAD_URL = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-amd64.exe`;

export async function ensureCloudflared(webconsoleRoot: string): Promise<string> {
	const override = process.env.RIVER_DASH_CLOUDFLARED_PATH;
	if (override) {
		const absolute = isAbsolute(override) ? override : resolve(webconsoleRoot, override);
		if (!existsSync(absolute)) throw new Error(`cloudflared was not found at ${absolute}`);
		return absolute;
	}
	const repoTools = resolve(webconsoleRoot, "../../..", "tools");
	for (const filename of process.platform === "win32"
		? ["cloudflared.exe", "cloudflared-windows-amd64.exe"] : ["cloudflared"]) {
		const binary = resolve(repoTools, filename);
		if (existsSync(binary)) return binary;
	}
	if (process.platform !== "win32" || process.arch !== "x64") {
		// Other platforms can install the official cloudflared binary on PATH.
		return process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
	}
	const cacheDir = resolve(webconsoleRoot, ".river-dash-state", "bin");
	const output = resolve(cacheDir, "cloudflared.exe");
	if (existsSync(output)) return output;
	await mkdir(cacheDir, { recursive: true });
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 120_000);
	let bytes: Buffer;
	try {
		const response = await fetch(DOWNLOAD_URL, { signal: controller.signal });
		if (!response.ok) throw new Error(`Download failed (${response.status}).`);
		bytes = Buffer.from(await response.arrayBuffer());
	} catch (error) {
		throw new Error(`Could not download cloudflared ${VERSION}. Check internet access, or copy the official executable into tools/cloudflared.exe.`, { cause: error });
	} finally {
		clearTimeout(timeout);
	}
	if (createHash("sha256").update(bytes).digest("hex") !== WINDOWS_X64_SHA256) {
		throw new Error("Downloaded cloudflared failed its SHA256 check. It was NOT executed. Install the official binary manually in tools/cloudflared.exe.");
	}
	const temp = `${output}.${process.pid}.tmp`;
	try {
		await writeFile(temp, bytes, { mode: 0o700 });
		await rename(temp, output);
	} finally { await rm(temp, { force: true }).catch(() => undefined); }
	return output;
}
