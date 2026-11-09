export type RemoteAccessStatus = {
	enabled: boolean;
	phase: "disabled" | "starting" | "connected" | "error";
	url: string | null;
	message: string | null;
};

async function readResponse(response: Response): Promise<RemoteAccessStatus> {
	if (!response.ok) {
		let error = `Remote viewing request failed (${response.status}).`;
		try {
			const body: unknown = await response.json();
			if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
				error = body.error;
			}
		} catch { /* Retain useful HTTP status. */ }
		throw new Error(error);
	}
	return response.json() as Promise<RemoteAccessStatus>;
}

export async function getRemoteAccessStatus(): Promise<RemoteAccessStatus> {
	return readResponse(await fetch("/api/remote-access", { cache: "no-store", credentials: "same-origin" }));
}

export async function setRemoteAccessEnabled(enabled: boolean): Promise<RemoteAccessStatus> {
	return readResponse(await fetch("/api/remote-access", {
		method: "PUT",
		credentials: "same-origin",
		headers: { "Content-Type": "application/json", "X-River-Dash-Management": "1" },
		body: JSON.stringify({ enabled }),
	}));
}
