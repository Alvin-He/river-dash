import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { backendProxy, createBackendProxy, lanAccessPlugin } from "./lanAccess.js";

/**
 * Normal mode: loopback operator, other TCP clients viewers (existing LAN flow).
 * tunnel-viewer mode: every request is a viewer, even when cloudflared connects
 * from 127.0.0.1. The tunnel entry point binds only to 127.0.0.1:4174.
 */
export default defineConfig(({ mode }) => {
	const viewerOnly = mode === "tunnel-viewer";
	const proxy = { "/api": viewerOnly ? createBackendProxy(true) : backendProxy };
	return {
		plugins: [lanAccessPlugin(viewerOnly), react()],
		build: {
			// Never rebuild the operator bundle when a viewer link is enabled.
			outDir: viewerOnly ? ".viewer-dist" : "dist",
		},
		server: {
			// A viewer build must not trigger operator HMR/reloads.
			watch: { ignored: ["**/.viewer-dist/**", "**/.river-dash-state/**"] },
			host: viewerOnly ? "127.0.0.1" : "0.0.0.0",
			port: viewerOnly ? 5174 : 5173,
			strictPort: true,
			proxy,
		},
		preview: {
			host: viewerOnly ? "127.0.0.1" : "0.0.0.0",
			port: viewerOnly ? 4174 : 4173,
			strictPort: true,
			proxy,
			// Quick Tunnels use a random *.trycloudflare.com Host. Only the
			// *built*, viewer-only preview accepts arbitrary Host headers.
			// Never enable this on the operator/dev server.
			allowedHosts: viewerOnly ? true : [],
		},
	};
});
