/** Tests for persistent manual mapping facts and write serialization. */
// src/mapping/manual.store.test.ts

import { beforeEach, describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTvdbId } from "@/providers/schemas";
import {
	clearManualFacts,
	getManualFacts,
	listManualFacts,
	setIgnored,
	setManualMapping,
} from "./manual.store";

const aid = parseAniListId;
const tvdb = parseTvdbId;

describe("manual mapping store", () => {
	beforeEach(async () => {
		await clearManualFacts();
	});

	it("keeps manual mapping and ignored as exclusive decisions", async () => {
		await setManualMapping("sonarr", aid(1), { providerId: tvdb(10) });
		await setIgnored("sonarr", aid(1));

		await expect(getManualFacts("sonarr", aid(1))).resolves.toEqual({
			ignored: true,
		});

		await setManualMapping("sonarr", aid(1), { providerId: tvdb(20) });

		await expect(getManualFacts("sonarr", aid(1))).resolves.toEqual({
			mapping: { providerId: tvdb(20) },
		});
	});

	it("serializes concurrent writes without losing records", async () => {
		await Promise.all([
			setManualMapping("sonarr", aid(1), { providerId: tvdb(10) }),
			setManualMapping("sonarr", aid(2), { providerId: tvdb(20) }),
		]);

		await expect(listManualFacts("sonarr")).resolves.toEqual([
			{ anilistId: aid(1), facts: { mapping: { providerId: tvdb(10) } } },
			{ anilistId: aid(2), facts: { mapping: { providerId: tvdb(20) } } },
		]);
	});
});
