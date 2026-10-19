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
	getSourceUpstreamLayers,
	getUniqueAniListIdForSource,
	getUniqueAniListIdsForSources,
	migrateUpstreamStore,
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

	it("decodes malformed current-v1 nested upstream fields safely", async () => {
		await seedLayerSnapshot({
			"anilist:1": {
				facts: { tmdbMovie: "bad", tmdbShow: tmdb(10) },
				scopes: { tmdbShow: { id: tmdb(10), seasons: [-1, 3] } },
				linkedAniListId: 0,
			},
		});

		await expect(getSourceUpstreamLayers(anilistSource(1))).resolves.toEqual({
			anilistId: aid(1),
			direct: {
				facts: { tmdbShow: tmdb(10) },
				scopes: { tmdbShow: { id: tmdb(10), seasons: [3] } },
			},
			canonical: {
				facts: { tmdbShow: tmdb(10) },
				scopes: { tmdbShow: { id: tmdb(10), seasons: [3] } },
			},
		});
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
			getSourceUpstreamLayers({ source: "mal", id: mal(5114) }),
		).resolves.toMatchObject({
			anilistId: aid(21),
			canonical: { facts: { tvdbShow: tvdb(81_797) } },
		});
		expect(setSpy).not.toHaveBeenCalled();
		setSpy.mockRestore();
	});

	it("uses only released v2 TMDB-specific Seerr seasons", async () => {
		await browser.storage.local.set({
			[UPSTREAM_STORAGE_KEY]: {
				mappings: { 1: [] },
				seerrTargets: {
					1: {
						mediaType: "tv",
						tmdbId: tmdb(400),
						tvdbId: tvdb(500),
						seasons: [2],
						tmdbSeasons: [3],
					},
				},
				fetchedAt: Date.now(),
			},
		});

		await migrateUpstreamStore();

		const stored = await browser.storage.local.get(UPSTREAM_STORAGE_KEY);
		expect(stored[UPSTREAM_STORAGE_KEY]).toMatchObject({
			version: 1,
			records: {
				"anilist:1": {
					facts: { tmdbShow: tmdb(400) },
					scopes: { tmdbShow: { id: tmdb(400), seasons: [3] } },
				},
			},
		});
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
			getSourceUpstreamLayers(anilistSource(1)),
		).resolves.toMatchObject({
			anilistId: aid(1),
			canonical: { facts: { tmdbMovie: tmdb(400) } },
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
			getSourceUpstreamLayers(anilistSource(1)),
		).resolves.toMatchObject({
			anilistId: aid(1),
			canonical: { facts: { tmdbMovie: tmdb(300) } },
		});
	});

	it("uses direct MAL targets before provider-specific AniList fallbacks", async () => {
		const source = { source: "mal", id: mal(5114) } as const;
		const lowerAlias = { source: "mal", id: mal(100) } as const;
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

		await expect(getSourceUpstreamLayers(source)).resolves.toMatchObject({
			anilistId: aid(21),
			direct: { facts: { tmdbMovie: tmdb(300) } },
			canonical: { facts: { tvdbShow: tvdb(78_874) } },
		});
		await expect(
			getUniqueAniListIdForSource({ source: "mal", id: mal(5114) }),
		).resolves.toBe(aid(21));
		await expect(getSourceAliasesByAniListId()).resolves.toEqual(
			new Map([[aid(21), [lowerAlias, source]]]),
		);
	});

	it("returns a direct MAL target without an AniList alias", async () => {
		const source = { source: "mal", id: mal(59_571) } as const;
		await seedSnapshot({
			"mal:59571": [{ kind: "tmdb-movie", id: tmdb(1_333_100) }],
		});

		await expect(getSourceUpstreamLayers(source)).resolves.toMatchObject({
			anilistId: null,
			direct: { facts: { tmdbMovie: tmdb(1_333_100) } },
		});
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
