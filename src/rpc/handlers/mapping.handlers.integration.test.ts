import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { mappingService } from "@/background/api-services";
import { setAutoResult } from "@/mapping/auto.store";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import { mappingHandlers } from "./mapping.handlers";
import { sonarrHandlers } from "./sonarr.handlers";

const automaticResolverMock = vi.hoisted(() => vi.fn());
const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());
const getUniqueAniListIdForSourceMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", async () => {
	const { MappingService } = await vi.importActual<
		typeof import("@/mapping/mapping.service")
	>("@/mapping/mapping.service");
	return {
		anilistMetadataStore: {
			getMetadata: vi.fn(async () => ({ metadata: [] })),
		},
		mappingService: new MappingService(automaticResolverMock),
		radarrLibrary: {
			getMovieSnapshots: vi.fn(async () => []),
		},
		sonarrLibrary: {
			getSeriesSnapshots: vi.fn(async () => []),
			getSeriesLibraryStatusByTvdbId: vi.fn(async ({ tvdbId }) => ({
				provider: "sonarr" as const,
				providerId: tvdbId,
				isInLibrary: false,
			})),
		},
	};
});

vi.mock("@/background/provider-config", () => ({
	getProviderConfig: vi.fn(async () => ({
		url: "https://sonarr.example",
		apiKey: "secret",
	})),
}));

vi.mock("@/mapping/upstream.store", async () => {
	const actual = await vi.importActual<
		typeof import("@/mapping/upstream.store")
	>("@/mapping/upstream.store");
	getUniqueAniListIdForSourceMock.mockImplementation(
		actual.getUniqueAniListIdForSource,
	);
	return {
		...actual,
		getUniqueAniListIdForSource: getUniqueAniListIdForSourceMock,
	};
});

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
	bumpProviderLibraryRevision: vi.fn(),
}));

const ANILIST_ID = parseAniListId(187_538);
const MAL_ID = parseMyAnimeListId(61_169);
const ANILIST_TVDB_ID = parseTvdbId(461_194);
const MAL_TVDB_ID = parseTvdbId(442_536);
const DIRECT_MAL_TVDB_ID = parseTvdbId(424_536);
const CANONICAL_TVDB_ID = parseTvdbId(424_537);
const CANONICAL_TMDB_ID = parseTmdbId(104_941);
const AUTO_TVDB_ID = parseTvdbId(78_874);
const ANILIST_SOURCE = { source: "anilist", id: ANILIST_ID } as const;
const MAL_SOURCE = { source: "mal", id: MAL_ID } as const;

function upstreamSnapshot(records: Record<string, object> = {}) {
	return {
		version: 1,
		records,
		fetchedAt: Date.now(),
	};
}

describe("source identity mapping boundary", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		automaticResolverMock.mockImplementation(
			async ({ writeToken, provider, identity, anilistId }) =>
				setAutoResult(
					writeToken,
					provider,
					identity,
					{ kind: "mapped", providerId: AUTO_TVDB_ID },
					anilistId ?? undefined,
				),
		);
		await browser.storage.local.set({
			"mapping:manual": { version: 1, records: {} },
			"mapping:auto": { version: 1, records: {} },
			"mapping:upstream": upstreamSnapshot(),
		});
	});

	it("reads and writes an AniList source under its canonical key", async () => {
		await mappingHandlers.setManualMapping({
			source: ANILIST_SOURCE,
			provider: "sonarr",
			providerId: ANILIST_TVDB_ID,
		});

		await expect(
			mappingService.getMapping("sonarr", ANILIST_SOURCE, ANILIST_ID),
		).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: ANILIST_TVDB_ID,
		});
		const stored = await browser.storage.local.get("mapping:manual");
		expect(stored["mapping:manual"]).toMatchObject({
			records: { [`anilist:${ANILIST_ID}`]: {} },
		});
	});

	it("prefers direct MAL data per provider and falls back independently", async () => {
		await browser.storage.local.set({
			"mapping:upstream": upstreamSnapshot({
				[`mal:${MAL_ID}`]: {
					linkedAniListId: ANILIST_ID,
					facts: { tvdbShow: DIRECT_MAL_TVDB_ID },
				},
				[`anilist:${ANILIST_ID}`]: {
					facts: {
						tvdbShow: CANONICAL_TVDB_ID,
						tmdbMovie: CANONICAL_TMDB_ID,
					},
				},
			}),
		});

		await expect(
			mappingService.getMapping("sonarr", MAL_SOURCE, ANILIST_ID),
		).resolves.toMatchObject({
			source: "upstream",
			providerId: DIRECT_MAL_TVDB_ID,
		});
		await expect(
			mappingService.getMapping("radarr", MAL_SOURCE, ANILIST_ID),
		).resolves.toMatchObject({
			source: "upstream",
			providerId: CANONICAL_TMDB_ID,
		});
	});

	it("resolves a linked MAL status once and writes only the AniList key", async () => {
		await browser.storage.local.set({
			"mapping:upstream": upstreamSnapshot({
				[`mal:${MAL_ID}`]: { linkedAniListId: ANILIST_ID, facts: {} },
			}),
		});

		await expect(
			sonarrHandlers.getSeriesStatus({ source: MAL_SOURCE }),
		).resolves.toMatchObject({
			mapping: { kind: "mapped", providerId: AUTO_TVDB_ID },
			isInLibrary: false,
		});

		expect(getUniqueAniListIdForSourceMock).toHaveBeenCalledOnce();
		expect(getUniqueAniListIdForSourceMock).toHaveBeenCalledWith(MAL_SOURCE);
		expect(automaticResolverMock).toHaveBeenCalledOnce();
		expect(automaticResolverMock).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "sonarr",
				identity: MAL_SOURCE,
				anilistId: ANILIST_ID,
			}),
		);

		const stored = await browser.storage.local.get("mapping:auto");
		const automatic = stored["mapping:auto"] as {
			records: Record<string, unknown>;
		};
		expect(Object.keys(automatic.records)).toEqual([`anilist:${ANILIST_ID}`]);
		expect(automatic.records[`mal:${MAL_ID}`]).toBeUndefined();
	});

	it("keeps an unlinked MAL read and write under the MAL identity", async () => {
		await mappingHandlers.setManualMapping({
			source: MAL_SOURCE,
			provider: "sonarr",
			providerId: MAL_TVDB_ID,
		});

		await expect(
			mappingService.getMapping("sonarr", MAL_SOURCE, null),
		).resolves.toMatchObject({ providerId: MAL_TVDB_ID });
		const stored = await browser.storage.local.get("mapping:manual");
		const manual = stored["mapping:manual"] as {
			records: Record<string, unknown>;
		};
		expect(Object.keys(manual.records)).toEqual([`mal:${MAL_ID}`]);
	});
});
