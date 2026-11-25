import { describe, it } from "vitest";
import { loadUpstreamRecords, report, time } from "./helpers";

describe("AniBridge stored dataset", () => {
	it("sizes and decode cost", async () => {
		const records = loadUpstreamRecords();
		const stored = { version: 1, records, fetchedAt: Date.now() };
		const json = JSON.stringify(stored);
		report("records", Object.keys(records).length);
		report(
			"anilist records",
			Object.keys(records).filter((k) => k.startsWith("anilist:")).length,
		);
		report("stored JSON size", (json.length / 1024 / 1024).toFixed(2), "MB");
		await time(
			"JSON.parse(stored snapshot) — Chrome-style decode per read",
			() => JSON.parse(json),
			7,
		);
		await time(
			"structuredClone(stored snapshot) — Firefox-style decode per read",
			() => structuredClone(stored),
			7,
		);
	});
});
