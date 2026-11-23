/** Tests for AniBridge upstream mapping refresh and storage behavior. */
// src/mapping/upstream.store.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { MAX_ANIBRIDGE_BYTES } from "@/mapping/upstream/anibridge.client";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { migrateMappingStorage } from "./migrate";
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

describe("version-1 upstream lookups", () => {
	const canonical = {
		facts: { tvdbShow: tvdb(500) },
		scopes: { tvdbShow: { id: tvdb(500), seasons: [2] } },
	};
	const direct = { facts: { tmdbMovie: tmdb(300) } };
	const records = {
		"anilist:1": canonical,
		"mal:10": { ...direct, linkedAniListId: aid(1) },
		"anilist:2": { facts: "bad" },
	};
	const source = { source: "mal", id: mal(10) } as const;

	afterEach(clearUpstreamMappings);

	it("skips writes when migrating a version-1 upstream snapshot", async () => {
		await seedLayerSnapshot({ "anilist:1": canonical });
		const setSpy = vi.spyOn(browser.storage.local, "set");

		await migrateUpstreamStore();

		expect(setSpy).not.toHaveBeenCalled();
	});

	it("leaves all current mapping stores untouched on repeated migration", async () => {
		await seedLayerSnapshot({
			"anilist:1": canonical,
			"mal:10": { ...direct, linkedAniListId: aid(1) },
		});
		await browser.storage.local.set({
			"mapping:manual": {
				version: 1,
				records: { "anilist:1": { facts: { tvdbShow: tvdb(10) } } },
			},
			"mapping:auto": {
				version: 1,
				records: {
					"anilist:2": { facts: {} },
					"anilist:1": {
						facts: { tmdbMovie: tmdb(10) },
						slotMeta: { tmdbMovie: { expiresAt: Date.now() + 10_000 } },
					},
				},
			},
		});
		const setSpy = vi.spyOn(browser.storage.local, "set");
		const localRemoveSpy = vi.spyOn(browser.storage.local, "remove");
		const syncRemoveSpy = vi.spyOn(browser.storage.sync, "remove");

		await migrateMappingStorage();
		await migrateMappingStorage();

		expect(setSpy).not.toHaveBeenCalled();
		expect(localRemoveSpy).not.toHaveBeenCalled();
		expect(syncRemoveSpy).not.toHaveBeenCalled();
	});

	it("returns the direct MAL and canonical AniList layers", async () => {
		await seedLayerSnapshot(records);

		await expect(getSourceUpstreamLayers(source)).resolves.toEqual({
			anilistId: aid(1),
			direct,
			canonical,
		});
		await expect(getUniqueAniListIdForSource(source)).resolves.toBe(aid(1));
		await expect(
			getUniqueAniListIdForSource({ source: "mal", id: mal(999) }),
		).resolves.toBeNull();
	});


	it("groups only linked MAL aliases in source-key order", async () => {
		await seedLayerSnapshot({
			"mal:11": { facts: {}, linkedAniListId: aid(1) },
			...records,
			"mal:12": { facts: {} },
		});

		await expect(getSourceAliasesByAniListId()).resolves.toEqual(
			new Map([[aid(1), [source, { source: "mal", id: mal(11) }]]]),
		);
	});
});

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

		await expect(migrateUpstreamStore()).resolves.toBe(true);
		await expect(browser.storage.local.get(UPSTREAM_STORAGE_KEY)).resolves.toEqual({});
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



	it("resolves a deduplicated alias batch with one pure storage read", async () => {
		const mapped = { source: "mal", id: mal(5114) } as const;
		const missing = { source: "mal", id: mal(59_571) } as const;
		await seedLayerSnapshot({ "mal:5114": { facts: {}, linkedAniListId: aid(21) } });
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
