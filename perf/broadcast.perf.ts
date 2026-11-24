/** Per-tab cost of one storage.onChanged payload for mapping:auto (old + new value). */
import { describe, it } from "vitest";
import { report, time } from "./helpers";

function autoStore(entries: number) {
	const records: Record<string, unknown> = {};
	const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
	for (let index = 0; index < entries; index += 1) {
		records[`anilist:${900_000 + index}`] = {
			facts: { tvdbShow: 500_000 + index },
			slotMeta: { tvdbShow: { expiresAt, matchedTitle: `Some Long Anime Title ${index}` } },
			attempts: { sonarrTvdb: { expiresAt } },
		};
	}
	return { version: 1, records };
}

describe("storage.onChanged payload per tab", () => {
	for (const entries of [300, 1500, 5000]) {
		it(`${entries} records`, async () => {
			const json = JSON.stringify(autoStore(entries));
			report(`auto store ${entries} records`, (json.length / 1024).toFixed(0), "KB");
			await time(`decode old+new payload in one tab (${entries} records)`, () => [JSON.parse(json), JSON.parse(json)], 7);
		});
	}
});
