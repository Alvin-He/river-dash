/**
 * Normalize session cookies from the Rust backend for the frontend origin.
 *
 * HTTP LAN => SameSite=Lax, HttpOnly.
 * HTTPS Cloudflare Tunnel => SameSite=Lax, HttpOnly, Secure.
 */
export function normalizeDevCookies(cookies: string[], secure = false): string[] {
	return cookies.map((cookie) => {
		if (!/^session=/i.test(cookie)) return cookie;
		let normalized = /;\s*SameSite=/i.test(cookie)
			? cookie.replace(/;\s*SameSite=[^;]+/i, "; SameSite=Lax")
			: `${cookie}; SameSite=Lax`;
		if (!/;\s*HttpOnly(?:\s*;|\s*$)/i.test(normalized)) {
			normalized += "; HttpOnly";
		}
		if (secure && !/;\s*Secure(?:\s*;|\s*$)/i.test(normalized)) {
			normalized += "; Secure";
		}
		return normalized;
	});
}
