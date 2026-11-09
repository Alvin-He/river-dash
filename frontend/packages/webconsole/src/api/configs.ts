import { readOnlyFetch, AuthApiError } from "../auth/authApi.ts";

/** Shape of the Rust backend's `sql::configs::Config` JSON response. */
export interface StoredDashboardConfig {
	name: string;
	/** The backend stores serialized component layout data as a string. */
	components: string;
}

/** Example of a real protected frontend-to-backend data call. */
export async function listDashboardConfigs(): Promise<StoredDashboardConfig[]> {
	const response = await readOnlyFetch("/configs");
	if (response.status === 401) {
		throw new AuthApiError("Session expired.", 401);
	}
	if (!response.ok) {
		throw new Error("Unable to load saved dashboard configurations.");
	}

	const payload: unknown = await response.json();
	if (
		!Array.isArray(payload) ||
		!payload.every(
			(item) =>
				typeof item === "object" &&
				item !== null &&
				typeof item.name === "string" &&
				typeof item.components === "string",
		)
	) {
		throw new Error("Invalid dashboard configuration response.");
	}
	return payload as StoredDashboardConfig[];
}
