import { beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTvdbId } from "@/providers/schemas";
import {
	clearManualFacts,
	getManualFacts,
	listAniListManualFacts,
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

		await expect(listAniListManualFacts("sonarr")).resolves.toEqual([
			{
				anilistId: aid(1),
				facts: { mapping: { providerId: tvdb(10) } },
			},
			{
				anilistId: aid(2),
				facts: { mapping: { providerId: tvdb(20) } },
			},
		]);
	});

	it("reads source-native MAL facts without listing them as AniList records", async () => {
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				sonarr: {
					"anilist:1": { mapping: { providerId: tvdb(10) } },
					"mal:5114": { mapping: { providerId: tvdb(78_874) } },
				},
				radarr: {},
			},
		});

		await expect(
			getManualFacts("sonarr", { source: "mal", id: mal(5114) }),
		).resolves.toEqual({ mapping: { providerId: tvdb(78_874) } });
		await expect(listAniListManualFacts("sonarr")).resolves.toEqual([
			{
				anilistId: aid(1),
				facts: { mapping: { providerId: tvdb(10) } },
			},
		]);
	});

	it("stores and lists a linked MAL decision through its AniList identity", async () => {
		const source = { source: "mal", id: mal(63_816) } as const;
		const anilistId = aid(209_939);

		await setManualMapping(
			"sonarr",
			source,
			{ providerId: tvdb(424_536) },
			anilistId,
		);

		await expect(
			getManualFacts("sonarr", source, anilistId),
		).resolves.toEqual({
			mapping: { providerId: tvdb(424_536) },
		});
		await expect(
			browser.storage.local.get(MANUAL_STORAGE_KEY),
		).resolves.toMatchObject({
			[MANUAL_STORAGE_KEY]: {
				sonarr: {
					"anilist:209939": {
						mapping: { providerId: tvdb(424_536) },
					},
				},
			},
		});
		await expect(listAniListManualFacts("sonarr")).resolves.toEqual([
			{
				anilistId,
				facts: { mapping: { providerId: tvdb(424_536) } },
			},
		]);
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
		await expect(listAniListManualFacts("sonarr")).resolves.toEqual([
			{
				anilistId: aid(1),
				facts: { mapping: { providerId: tvdb(10) } },
			},
		]);
	});
});
