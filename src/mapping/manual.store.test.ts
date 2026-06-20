/** Tests for persistent manual mapping facts and write serialization. */
// src/mapping/manual.store.test.ts

import { beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTvdbId } from "@/providers/schemas";
import {
	clearManualFacts,
	getManualFacts,
	listManualFacts,
	listSourceManualFacts,
	setIgnored,
	setManualMapping,
} from "./manual.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tvdb = parseTvdbId;
const MANUAL_STORAGE_KEY = "mapping:manual";

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

	it("stores and lists MAL source facts", async () => {
		await setManualMapping("sonarr", { source: "mal", id: mal(5114) }, {
			providerId: tvdb(78_874),
		});

		await expect(
			getManualFacts("sonarr", { source: "mal", id: mal(5114) }),
		).resolves.toEqual({
			mapping: { providerId: tvdb(78_874) },
		});
		await expect(listSourceManualFacts("sonarr")).resolves.toEqual([
			{
				source: { source: "mal", id: mal(5114) },
				facts: { mapping: { providerId: tvdb(78_874) } },
			},
		]);
		await expect(listManualFacts("sonarr")).resolves.toEqual([]);
	});

	it("reads legacy raw AniList keys", async () => {
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				sonarr: {
					1: { mapping: { providerId: tvdb(10) } },
				},
				radarr: {},
			},
		});

		await expect(getManualFacts("sonarr", aid(1))).resolves.toEqual({
			mapping: { providerId: tvdb(10) },
		});
		await expect(listManualFacts("sonarr")).resolves.toEqual([
			{ anilistId: aid(1), facts: { mapping: { providerId: tvdb(10) } } },
		]);
	});
});
