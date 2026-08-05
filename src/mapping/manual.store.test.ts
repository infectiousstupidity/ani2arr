import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	clearManualFacts,
	consolidateManualAliases,
	getManualLayerRecord,
	listAniListManualLayers,
	migrateManualStore,
	setIgnored,
	setManualMapping,
	setManualSeerrTarget,
} from "./manual.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const MANUAL_STORAGE_KEY = "mapping:manual";

describe("manual mapping store", () => {
	beforeEach(async () => {
		await clearManualFacts();
	});

	it("keeps provider decisions independent from shared facts", async () => {
		await setManualMapping("sonarr", aid(1), { providerId: tvdb(10) });
		await setIgnored("sonarr", aid(1));

		await expect(getManualLayerRecord(aid(1))).resolves.toMatchObject({
			facts: { tvdbShow: tvdb(10) },
			decisions: { sonarr: { ignored: true } },
		});

		await setManualMapping("sonarr", aid(1), { providerId: tvdb(20) });

		await expect(getManualLayerRecord(aid(1))).resolves.toEqual({
			facts: { tvdbShow: tvdb(20) },
		});
	});

	it("serializes concurrent writes without losing records", async () => {
		await Promise.all([
			setManualMapping("sonarr", aid(1), { providerId: tvdb(10) }),
			setManualMapping("sonarr", aid(2), { providerId: tvdb(20) }),
		]);

		await expect(listAniListManualLayers()).resolves.toEqual([
			{
				anilistId: aid(1),
				record: { facts: { tvdbShow: tvdb(10) } },
			},
			{
				anilistId: aid(2),
				record: { facts: { tvdbShow: tvdb(20) } },
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
			getManualLayerRecord({ source: "mal", id: mal(5114) }),
		).resolves.toEqual({ facts: { tvdbShow: tvdb(78_874) } });
		await expect(listAniListManualLayers()).resolves.toEqual([
			{
				anilistId: aid(1),
				record: { facts: { tvdbShow: tvdb(10) } },
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
			getManualLayerRecord(source, anilistId),
		).resolves.toEqual({
			facts: { tvdbShow: tvdb(424_536) },
		});
		await expect(
			browser.storage.local.get(MANUAL_STORAGE_KEY),
		).resolves.toMatchObject({
			[MANUAL_STORAGE_KEY]: {
				version: 1,
				records: {
					"anilist:209939": {
						facts: { tvdbShow: tvdb(424_536) },
					},
				},
			},
		});
		await expect(listAniListManualLayers()).resolves.toEqual([
			{
				anilistId,
				record: { facts: { tvdbShow: tvdb(424_536) } },
			},
		]);
	});

	it("reads canonical and pre-link alias facts together before consolidating on mutation", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				version: 1,
				records: {
					"anilist:1": { facts: { tvdbShow: tvdb(10) } },
					"mal:5114": { facts: { tmdbShow: tmdb(20) } },
				},
			},
		});

		await expect(getManualLayerRecord(source, aid(1))).resolves.toEqual({
			facts: { tmdbShow: tmdb(20), tvdbShow: tvdb(10) },
		});

		await setIgnored("sonarr", source, aid(1));
		const stored = await browser.storage.local.get(MANUAL_STORAGE_KEY);
		const envelope = stored[MANUAL_STORAGE_KEY] as {
			records: Record<string, unknown>;
		};
		expect(envelope).toMatchObject({
			records: {
				"anilist:1": {
					facts: { tmdbShow: tmdb(20), tvdbShow: tvdb(10) },
					decisions: { sonarr: { ignored: true } },
				},
			},
		});
		expect(envelope.records).not.toHaveProperty("mal:5114");
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

		await expect(getManualLayerRecord(aid(1))).resolves.toEqual({
			facts: { tvdbShow: tvdb(10) },
		});
		await expect(listAniListManualLayers()).resolves.toEqual([
			{
				anilistId: aid(1),
				record: { facts: { tvdbShow: tvdb(10) } },
			},
		]);
	});

	it("migrates v1 mirrors by newest value while any ignore wins", async () => {
		await browser.storage.local.remove(MANUAL_STORAGE_KEY);
		await browser.storage.local.set({
			mappingOverridesCache: {
				1: { tvdbId: 10, updatedAt: 1 },
				2: { tvdbId: 20, updatedAt: 5 },
			},
			ignoredMappingsCache: { 3: { updatedAt: 3 } },
		});
		await browser.storage.sync.set({
			mappingOverrides: {
				1: { tvdbId: 11, updatedAt: 2 },
				2: { tvdbId: 22, updatedAt: 3 },
				3: { tvdbId: 33, updatedAt: 4 },
			},
			ignoredMappings: { 2: { updatedAt: 1 } },
		});

		await migrateManualStore();

		await expect(listAniListManualLayers()).resolves.toEqual([
			{ anilistId: aid(1), record: { facts: { tvdbShow: tvdb(11) } } },
			{
				anilistId: aid(2),
				record: {
					facts: {},
					decisions: { sonarr: { ignored: true } },
				},
			},
			{
				anilistId: aid(3),
				record: {
					facts: {},
					decisions: { sonarr: { ignored: true } },
				},
			},
		]);
		await expect(
			browser.storage.local.get([
				"mappingOverridesCache",
				"ignoredMappingsCache",
			]),
		).resolves.toEqual({});
		await expect(
			browser.storage.sync.get(["mappingOverrides", "ignoredMappings"]),
		).resolves.toEqual({});
	});

	it("merges released Arr and Seerr stores without promoting Seerr TVDB", async () => {
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				sonarr: {
					1: { mapping: { providerId: tvdb(100) } },
				},
				radarr: {
					1: { mapping: { providerId: tmdb(200) } },
				},
			},
			"mapping:seerr-targets": {
				1: { mediaType: "movie", tmdbId: tmdb(300) },
				2: {
					mediaType: "tv",
					tmdbId: tmdb(400),
					tvdbId: tvdb(500),
					seasons: [2],
				},
			},
		});

		await migrateManualStore();

		await expect(getManualLayerRecord(aid(1))).resolves.toEqual({
			facts: { tmdbMovie: tmdb(200), tvdbShow: tvdb(100) },
		});
		await expect(getManualLayerRecord(aid(2))).resolves.toEqual({
			facts: { tmdbShow: tmdb(400) },
			scopes: { tmdbShow: { id: tmdb(400), seasons: [2] } },
			tvShowPairs: [
				{
					tmdbShow: tmdb(400),
					tvdbShow: tvdb(500),
					tmdbSeasons: [2],
					tvdbSeasons: [2],
				},
			],
		});
		await expect(
			browser.storage.local.get("mapping:seerr-targets"),
		).resolves.toEqual({});
	});

	it("consolidates aliases canonical-first and copies only compatible evidence", async () => {
		await browser.storage.local.set({
			[MANUAL_STORAGE_KEY]: {
				version: 1,
				records: {
					"anilist:1": {
						facts: { tmdbShow: tmdb(50), tvdbShow: tvdb(10) },
					},
					"mal:2": {
						facts: {
							tmdbMovie: tmdb(30),
							tmdbShow: tmdb(60),
							tvdbShow: tvdb(20),
						},
						scopes: { tmdbShow: { id: tmdb(60), seasons: [1] } },
						tvShowPairs: [
							{ tmdbShow: tmdb(60), tvdbShow: tvdb(70) },
						],
						decisions: {
							radarr: { rejectedTmdbMovie: [tmdb(31)] },
						},
					},
					"mal:3": {
						facts: { tmdbMovie: tmdb(40), tmdbShow: tmdb(50) },
						scopes: { tmdbShow: { id: tmdb(50), seasons: [2] } },
						tvShowPairs: [
							{ tmdbShow: tmdb(50), tvdbShow: tvdb(80) },
						],
						decisions: { sonarr: { ignored: true } },
					},
				},
			},
		});

		await consolidateManualAliases(
			new Map([
				[
					aid(1),
					[
						{ source: "mal", id: mal(3) },
						{ source: "mal", id: mal(2) },
					],
				],
			]),
		);

		await expect(getManualLayerRecord(aid(1))).resolves.toEqual({
			facts: {
				tmdbMovie: tmdb(30),
				tmdbShow: tmdb(50),
				tvdbShow: tvdb(10),
			},
			scopes: { tmdbShow: { id: tmdb(50), seasons: [2] } },
			tvShowPairs: [{ tmdbShow: tmdb(50), tvdbShow: tvdb(80) }],
			decisions: {
				sonarr: { ignored: true },
				radarr: { rejectedTmdbMovie: [tmdb(31)] },
			},
		});
		await expect(
			browser.storage.local.get(MANUAL_STORAGE_KEY),
		).resolves.not.toMatchObject({
			[MANUAL_STORAGE_KEY]: { records: { "mal:2": {}, "mal:3": {} } },
		});
	});

	it("is idempotent and retains legacy keys when replacement writing fails", async () => {
		await browser.storage.local.remove(MANUAL_STORAGE_KEY);
		await browser.storage.local.set({
			"mapping:seerr-targets": {
				1: { mediaType: "movie", tmdbId: tmdb(300) },
			},
		});
		const setSpy = vi
			.spyOn(browser.storage.local, "set")
			.mockRejectedValueOnce(new Error("write failed"));

		await expect(migrateManualStore()).rejects.toThrow("write failed");
		setSpy.mockRestore();
		await expect(
			browser.storage.local.get("mapping:seerr-targets"),
		).resolves.toHaveProperty("mapping:seerr-targets");

		await migrateManualStore();
		const first = await browser.storage.local.get(MANUAL_STORAGE_KEY);
		await migrateManualStore();
		await expect(
			browser.storage.local.get(MANUAL_STORAGE_KEY),
		).resolves.toEqual(first);
	});

	it("clears current and all known manual legacy keys", async () => {
		await setManualSeerrTarget(aid(1), {
			mediaType: "movie",
			tmdbId: tmdb(1),
		});
		await browser.storage.local.set({
			"mapping:seerr-targets": {},
			mappingOverridesCache: {},
			ignoredMappingsCache: {},
		});
		await browser.storage.sync.set({
			mappingOverrides: {},
			ignoredMappings: {},
		});

		await clearManualFacts();

		await expect(browser.storage.local.get(null)).resolves.toMatchObject({
			[MANUAL_STORAGE_KEY]: { version: 1, records: {} },
		});
		await expect(
			browser.storage.local.get([
				"mapping:seerr-targets",
				"mappingOverridesCache",
				"ignoredMappingsCache",
			]),
		).resolves.toEqual({});
		await expect(
			browser.storage.sync.get(["mappingOverrides", "ignoredMappings"]),
		).resolves.toEqual({});
	});
});
