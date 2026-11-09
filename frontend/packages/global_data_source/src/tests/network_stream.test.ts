import { err, ok } from "neverthrow";
import { afterEach, expect, test, vi } from "vitest";
import { NetworkTopicStream, type Transport } from "../network_stream.ts";

const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => errorLog.mockClear());

test("a transport error does not replay the last received batch", async () => {
	let reads = 0;
	const transport: Transport = {
		send_data() { return Promise.resolve(ok()); },
		async receive_data() {
			reads += 1;
			if (reads === 1) return ok(["invalid JSON"]);
			if (reads === 2) return err("temporarily unavailable");
			// Delay subsequent reads so the test can stop the stream safely.
			return new Promise((resolve) => setTimeout(() => resolve(ok([])), 30));
		},
	};
	const stream = new NetworkTopicStream(transport);
	try {
		stream.start();
		await new Promise((resolve) => setTimeout(resolve, 15));
		const invalidJsonReports = errorLog.mock.calls.filter(([message]) =>
			String(message).startsWith("Invalid topic message JSON:"),
		);
		expect(invalidJsonReports).toHaveLength(1);
		expect(reads).toBeGreaterThanOrEqual(3);
	} finally {
		stream.stop();
	}
});
