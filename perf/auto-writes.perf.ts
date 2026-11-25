/** Cost of storing automatic results: one full auto-store write per resolved card. */
import { describe, it, vi } from "vitest";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist/types";
import {
	captureAutomaticWriteToken,
	setAutoResult,
} from "@/mapping/auto.store";
import { report, time, useRealisticStorage } from "./helpers";

async function seedAutomaticStore(entries: number): Promise<void> {
	const records: Record<string, unknown> = {};
	const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
	for (let index = 0; index < entries; index += 1) {
		records[`anilist:${900_000 + index}`] = {
			facts: { tvdbShow: 500_000 + index },
			slotMeta: {
				tvdbShow: { expiresAt, matchedTitle: `Some Long Anime Title ${index}` },
			},
			attempts: { sonarrTvdb: { expiresAt } },
		};
	}
	await browser.storage.local.set({ "mapping:auto": { version: 1, records } });
	report(
		`auto store JSON size (${entries} records)`,
		(JSON.stringify(records).length / 1024).toFixed(0),
		"KB",
	);
}

describe("automatic store writes", () => {
	it("50 sequential setAutoResult (one browse batch of unmapped cards)", async () => {
		useRealisticStorage();
		await seedAutomaticStore(1500);
		let next = 1;
		const writes = vi.spyOn(browser.storage.local, "set");
		await time(
			"50 x setAutoResult into a 1500-record store",
			async () => {
				await Promise.all(
					Array.from({ length: 50 }, () =>
						setAutoResult(
							captureAutomaticWriteToken(),
							"sonarr",
							next++ as AniListId,
							{
								kind: "unmapped",
							},
						),
					),
				);
			},
			3,
		);
		// Write-behind flushes on a timer; let it run, then count broadcasts.
		await new Promise((resolve) => setTimeout(resolve, 1100));
		const autoWrites = writes.mock.calls.filter(
			([items]) => "mapping:auto" in (items as object),
		).length;
		report(
			"storage.local writes of mapping:auto for 150 results (3 batches)",
			autoWrites,
		);
	});
});
