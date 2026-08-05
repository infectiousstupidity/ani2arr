/** Tests for AniBridge upstream mapping refresh and storage behavior. */
// src/mapping/upstream.store.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { MAX_ANIBRIDGE_BYTES } from "@/mapping/upstream/anibridge.client";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import {
	clearUpstreamMappings,
	getSourceAliasesByAniListId,
	getSourceSeerrUpstreamMapping,
	getSourceUpstreamMapping,
	getUniqueAniListIdForSource,
	getUniqueAniListIdsForSources,
	listAllSeerrUpstreamTargets,
	listAniListUpstreamMappings,
	listSeerrUpstreamTargets,
	refreshUpstreamMappings,
} from "./upstream.store";

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;
const anilistSource = (id: number) =>
	({ source: "anilist", id: aid(id) }) as const;
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_STORAGE_KEY = "mapping:upstream";

type SnapshotOverrides = Partial<{
	linkedAniListIds: Record<string, ReturnType<typeof aid>>;
	fetchedAt: number;
	etag: string;
}>;

function createAniBridgeResponse(
	body: string,
	headers?: HeadersInit,
): Response {
	return new Response(body, {
		status: 200,
		...(headers ? { headers } : {}),
	});
}

function mockAniBridgeResponse(response: Response): void {
	vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(response));
}

async function seedSnapshot(
	targetsBySource: Record<string, unknown[]>,
	overrides: SnapshotOverrides = {},
): Promise<void> {
	const records = Object.fromEntries(
		Object.entries(targetsBySource).map(([sourceKey, targets]) => [
			sourceKey,
			{
				...(overrides.linkedAniListIds?.[sourceKey] === undefined
					? {}
					: { linkedAniListId: overrides.linkedAniListIds[sourceKey] }),
				targets,
			},
		]),
	);
	for (const [sourceKey, linkedAniListId] of Object.entries(
		overrides.linkedAniListIds ?? {},
	)) {
		records[sourceKey] ??= { linkedAniListId, targets: [] };
	}
	await browser.storage.local.set({
		[UPSTREAM_STORAGE_KEY]: {
			records,
			fetchedAt: Date.now(),
			...(overrides.fetchedAt === undefined
				? {}
				: { fetchedAt: overrides.fetchedAt }),
			...(overrides.etag === undefined ? {} : { etag: overrides.etag }),
		},
	});
}

async function seedLayerSnapshot(
	records: Record<string, unknown>,
	overrides: SnapshotOverrides = {},
): Promise<void> {
	await browser.storage.local.set({
		[UPSTREAM_STORAGE_KEY]: {
			version: 1,
			records,
			fetchedAt: overrides.fetchedAt ?? Date.now(),
			...(overrides.etag === undefined ? {} : { etag: overrides.etag }),
		},
	});
}

describe("refreshUpstreamMappings", () => {
	afterEach(async () => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		await clearUpstreamMappings();
	});

	it.each([
		{
			name: "oversized payload",
			response: () =>
				createAniBridgeResponse("", {
					"Content-Length": String(MAX_ANIBRIDGE_BYTES + 1),
				}),
			error: "AniBridge mappings payload is too large.",
		},
		{
			name: "invalid JSON",
			response: () => createAniBridgeResponse("{"),
			error: "AniBridge mappings payload is not valid JSON.",
		},
		{
			name: "payloads with no valid mappings",
			response: () => createAniBridgeResponse("{}"),
			error: "AniBridge mappings payload did not contain valid mappings.",
		},
	])("rejects $name", async ({ response, error }) => {
		mockAniBridgeResponse(response());

		await expect(refreshUpstreamMappings()).rejects.toThrow(error);
	});

	it("persists normalized source records and refresh metadata", async () => {
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anilist:1": { "tmdb_movie:300": {} },
				}),
			),
		);

		await expect(refreshUpstreamMappings()).resolves.toBe(true);

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			version: 1,
			records: {
				"anilist:1": {
					facts: { tmdbMovie: tmdb(300) },
				},
			},
			fetchedAt: expect.any(Number),
		});
	});

	it("reports unchanged without downloading a fresh canonical snapshot", async () => {
		await seedLayerSnapshot({
			"anilist:1": { facts: { tmdbMovie: tmdb(300) } },
		});
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);

		await expect(refreshUpstreamMappings()).resolves.toBe(false);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("decodes released split snapshots without writing during reads", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: {
					"anilist:21": [{ kind: "tvdb-show", id: tvdb(81_797) }],
					"mal:5114": [{ kind: "tmdb-movie", id: tmdb(300) }],
				},
				aniListCrosswalks: { "mal:5114": aid(21) },
				fetchedAt: Date.now(),
			},
		});
		const setSpy = vi.spyOn(browser.storage.local, "set");

		await expect(
			getSourceUpstreamMapping("sonarr", { source: "mal", id: mal(5114) }),
		).resolves.toEqual({
			anilistId: aid(21),
			targets: [{ provider: "sonarr", providerId: tvdb(81_797) }],
		});
		expect(setSpy).not.toHaveBeenCalled();
		setSpy.mockRestore();
	});

	it("forces a full refresh for fresh legacy snapshots", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				entries: { 1: [{ kind: "tmdb-movie", id: tmdb(300) }] },
				aniListCrosswalks: {},
				fetchedAt: Date.now(),
				etag: "legacy-etag",
			},
		});
		const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
			expect(init?.headers).toEqual({});
			return createAniBridgeResponse(
				JSON.stringify({
					"anilist:1": { "tmdb_movie:400": {} },
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(refreshUpstreamMappings()).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledOnce();
		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			version: 1,
			records: {
				"anilist:1": {
					facts: { tmdbMovie: tmdb(400) },
				},
			},
			fetchedAt: expect.any(Number),
		});
		await expect(
			getSourceUpstreamMapping("radarr", anilistSource(1)),
		).resolves.toEqual({
			anilistId: aid(1),
			targets: [{ provider: "radarr", providerId: tmdb(400) }],
		});
	});

	it("refreshes canonical snapshot metadata after an ETag 304", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		const records = {
			"anilist:1": { facts: { tmdbMovie: tmdb(300) } },
		};
		await seedLayerSnapshot(records, {
			fetchedAt: Date.now() - UPSTREAM_REFRESH_INTERVAL_MS - 1,
			etag: "canonical-etag",
		});
		const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
			expect(init?.headers).toEqual({
				"If-None-Match": "canonical-etag",
			});
			return new Response(null, { status: 304 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(refreshUpstreamMappings()).resolves.toBe(false);

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			version: 1,
			records: {
				"anilist:1": records["anilist:1"],
			},
			fetchedAt: Date.now(),
			etag: "canonical-etag",
		});
	});

	it("reports unchanged when a download contains the same mapping facts", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
		const records = {
			"anilist:1": { facts: { tmdbMovie: tmdb(300) } },
			"mal:5114": { facts: {}, linkedAniListId: aid(1) },
		};
		await seedLayerSnapshot(records, {
			fetchedAt: Date.now() - UPSTREAM_REFRESH_INTERVAL_MS - 1,
			etag: "old-etag",
		});
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anilist:1": { "tmdb_movie:300": {} },
					"mal:5114": { "anilist:1": {} },
				}),
				{ ETag: "new-etag" },
			),
		);

		await expect(refreshUpstreamMappings()).resolves.toBe(false);

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toEqual({
			version: 1,
			records,
			fetchedAt: Date.now(),
			etag: "new-etag",
		});
	});

	it("keeps previous stored snapshot when refresh payload is invalid", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		mockAniBridgeResponse(
			createAniBridgeResponse(
				JSON.stringify({
					"anilist:1": { "tmdb_movie:300": {} },
				}),
				{ ETag: "previous-etag" },
			),
		);
		await refreshUpstreamMappings();

		vi.setSystemTime(Date.now() + UPSTREAM_REFRESH_INTERVAL_MS + 1);
		mockAniBridgeResponse(createAniBridgeResponse("{"));

		await expect(refreshUpstreamMappings()).rejects.toThrow(
			"AniBridge mappings payload is not valid JSON.",
		);
		await expect(
			getSourceUpstreamMapping("radarr", anilistSource(1)),
		).resolves.toEqual({
			anilistId: aid(1),
			targets: [{ provider: "radarr", providerId: tmdb(300) }],
		});
		await expect(listSeerrUpstreamTargets([aid(1)])).resolves.toEqual([
			{
				anilistId: aid(1),
				kind: "target",
				target: { mediaType: "movie", tmdbId: tmdb(300) },
			},
		]);
	});

	it("normalizes Arr targets by provider ID", async () => {
		await seedSnapshot({
			"anilist:21": [
				{ kind: "tvdb-show", id: tvdb(81_797), season: 0 },
				{ kind: "tvdb-show", id: tvdb(81_797), season: 1 },
				{ kind: "tvdb-show", id: tvdb(81_797), season: 2 },
				{ kind: "tvdb-show", id: tvdb(81_797), season: 2 },
			],
			"anilist:3": [
				{ kind: "tvdb-show", id: tvdb(100), season: 1 },
				{ kind: "tvdb-show", id: tvdb(200), season: 2 },
			],
			"anilist:4": [
				{ kind: "tmdb-movie", id: tmdb(300) },
				{ kind: "tmdb-movie", id: tmdb(400) },
			],
		});

		await expect(
			Promise.all([
				getSourceUpstreamMapping("sonarr", anilistSource(21)),
				getSourceUpstreamMapping("sonarr", anilistSource(3)),
				getSourceUpstreamMapping("radarr", anilistSource(4)),
			]),
		).resolves.toEqual([
			{
				anilistId: aid(21),
				targets: [{ provider: "sonarr", providerId: tvdb(81_797) }],
			},
			{
				anilistId: aid(3),
				targets: [
					{ provider: "sonarr", providerId: tvdb(100), season: 1 },
					{ provider: "sonarr", providerId: tvdb(200), season: 2 },
				],
			},
			{
				anilistId: aid(4),
				targets: [
					{ provider: "radarr", providerId: tmdb(300) },
					{ provider: "radarr", providerId: tmdb(400) },
				],
			},
		]);
	});

	it("derives a normalized Seerr TV target from canonical entries", async () => {
		await seedSnapshot({
			"anilist:20": [
				{ kind: "tmdb-show", id: tmdb(500) },
				{ kind: "tmdb-show", id: tmdb(500), season: 2 },
				{ kind: "tmdb-show", id: tmdb(500), season: 0 },
				{ kind: "tmdb-show", id: tmdb(500), season: 2 },
				{ kind: "tvdb-show", id: tvdb(700), season: 1 },
				{ kind: "tvdb-show", id: tvdb(700), season: 0 },
			],
		});

		await expect(listSeerrUpstreamTargets([aid(20)])).resolves.toEqual([
			{
				anilistId: aid(20),
				kind: "target",
				target: {
					mediaType: "tv" as const,
					tmdbId: tmdb(500),
					seasons: [0, 1, 2],
					tmdbSeasons: [0, 2],
					tvdbSeasons: [0, 1],
					tvdbId: tvdb(700),
				},
			},
		]);
		await expect(listAllSeerrUpstreamTargets()).resolves.toHaveLength(1);
	});

	it("reports movie and media-type conflicts", async () => {
		await seedSnapshot({
			"anilist:2": [
				{ kind: "tmdb-movie", id: tmdb(400) },
				{ kind: "tmdb-movie", id: tmdb(300) },
			],
			"anilist:3": [
				{ kind: "tmdb-movie", id: tmdb(300) },
				{ kind: "tmdb-show", id: tmdb(500), season: 1 },
			],
		});

		await expect(listSeerrUpstreamTargets([aid(2), aid(3)])).resolves.toEqual([
			{ anilistId: aid(2), kind: "conflict" },
			{ anilistId: aid(3), kind: "conflict" },
		]);
	});

	it("uses unambiguous TVDB identity and lets TVDB-only facts fall back", async () => {
		await seedSnapshot({
			"anilist:1": [
				{ kind: "tmdb-show", id: tmdb(500) },
				{ kind: "tvdb-show", id: tvdb(700), season: 0 },
			],
			"anilist:3": [{ kind: "tvdb-show", id: tvdb(702), season: 1 }],
		});

		await expect(listSeerrUpstreamTargets([aid(1), aid(3)])).resolves.toEqual([
			{
				anilistId: aid(1),
				kind: "target",
				target: {
					mediaType: "tv",
					tmdbId: tmdb(500),
					seasons: [0],
					tvdbSeasons: [0],
					tvdbId: tvdb(700),
				},
			},
		]);
		await expect(
			getSourceSeerrUpstreamMapping(anilistSource(3)),
		).resolves.toEqual({ anilistId: aid(3), kind: "missing" });
	});

	it("uses direct MAL targets before provider-specific AniList fallbacks", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const lowerAlias = { source: "mal", id: mal(100) } as const;
		const targets = [
			{ provider: "sonarr" as const, providerId: tvdb(78_874), season: 1 },
		];
		await seedSnapshot(
			{
				"anilist:21": [
					{ kind: "tvdb-show", id: tvdb(78_874), season: 1 },
					{ kind: "tmdb-show", id: tmdb(1396), season: 1 },
				],
				"mal:5114": [{ kind: "tmdb-movie", id: tmdb(300) }],
			},
			{
				linkedAniListIds: {
					[sourceIdentityKey(source)]: aid(21),
					[sourceIdentityKey(lowerAlias)]: aid(21),
				},
			},
		);

		await expect(getSourceUpstreamMapping("sonarr", source)).resolves.toEqual({
			anilistId: aid(21),
			targets,
		});
		await expect(getSourceUpstreamMapping("radarr", source)).resolves.toEqual({
			anilistId: aid(21),
			targets: [{ provider: "radarr", providerId: tmdb(300) }],
		});
		await expect(listAniListUpstreamMappings()).resolves.toEqual([
			{
				anilistId: aid(21),
				targets,
			},
		]);
		await expect(
			getUniqueAniListIdForSource({ source: "mal", id: mal(5114) }),
		).resolves.toBe(aid(21));
		await expect(getSourceAliasesByAniListId()).resolves.toEqual(
			new Map([[aid(21), [lowerAlias, source]]]),
		);
	});

	it("falls back to AniList Seerr facts only when direct MAL facts are missing", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		await seedSnapshot(
			{
				"anilist:21": [{ kind: "tmdb-movie", id: tmdb(400) }],
			},
			{ linkedAniListIds: { [sourceIdentityKey(source)]: aid(21) } },
		);

		await expect(getSourceSeerrUpstreamMapping(source)).resolves.toEqual({
			anilistId: aid(21),
			kind: "target",
			target: { mediaType: "movie", tmdbId: tmdb(400) },
		});
	});

	it("does not replace conflicting direct MAL facts with an AniList target", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		await seedSnapshot(
			{
				"anilist:21": [{ kind: "tmdb-movie", id: tmdb(400) }],
				"mal:5114": [
					{ kind: "tmdb-movie", id: tmdb(100) },
					{ kind: "tmdb-movie", id: tmdb(200) },
				],
			},
			{ linkedAniListIds: { [sourceIdentityKey(source)]: aid(21) } },
		);

		await expect(getSourceSeerrUpstreamMapping(source)).resolves.toEqual({
			anilistId: aid(21),
			kind: "conflict",
		});
	});

	it("returns a direct MAL target without an AniList alias", async () => {
		const source = { source: "mal", id: mal(59_571) } as const;
		await seedSnapshot({
			"mal:59571": [{ kind: "tmdb-movie", id: tmdb(1_333_100) }],
		});

		await expect(getSourceUpstreamMapping("radarr", source)).resolves.toEqual({
			anilistId: null,
			targets: [{ provider: "radarr", providerId: tmdb(1_333_100) }],
		});
		await expect(getSourceSeerrUpstreamMapping(source)).resolves.toEqual({
			anilistId: null,
			kind: "target",
			target: { mediaType: "movie", tmdbId: tmdb(1_333_100) },
		});
		await expect(listAniListUpstreamMappings()).resolves.toEqual([]);
	});

	it("resolves a deduplicated alias batch with one pure storage read", async () => {
		const mapped = { source: "mal", id: mal(5114) } as const;
		const missing = { source: "mal", id: mal(59_571) } as const;
		await seedSnapshot({}, { linkedAniListIds: { "mal:5114": aid(21) } });
		const getSpy = vi.spyOn(browser.storage.local, "get");
		const setSpy = vi.spyOn(browser.storage.local, "set");

		await expect(
			getUniqueAniListIdsForSources([
				mapped,
				missing,
				mapped,
				anilistSource(10),
			]),
		).resolves.toEqual({
			"mal:5114": aid(21),
			"mal:59571": null,
			"anilist:10": aid(10),
		});
		expect(getSpy).toHaveBeenCalledOnce();
		expect(setSpy).not.toHaveBeenCalled();
		getSpy.mockRestore();
		setSpy.mockRestore();
	});
});
