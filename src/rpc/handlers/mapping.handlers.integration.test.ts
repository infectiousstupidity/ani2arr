/** Regression test for canonical mapping facts across the RPC boundary. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { mappingService } from "@/background/api-services";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTvdbId } from "@/providers/schemas";
import { mappingHandlers } from "./mapping.handlers";

const bumpMappingsRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", async () => {
	const { MappingService } = await vi.importActual<
		typeof import("@/mapping/mapping.service")
	>("@/mapping/mapping.service");

	return {
		anilistMetadataStore: {
			getMetadata: vi.fn(async () => ({ metadata: [] })),
		},
		mappingService: new MappingService(async () => false),
		radarrLibrary: {
			getMovieSnapshots: vi.fn(async () => []),
		},
		sonarrLibrary: {
			getSeriesSnapshots: vi.fn(async () => []),
		},
	};
});

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const ANILIST_ID = parseAniListId(187_538);
const MAL_ID = parseMyAnimeListId(61_169);
const LEGACY_TVDB_ID = parseTvdbId(461_194);
const MAL_TVDB_ID = parseTvdbId(442_536);
const MAL_SOURCE = { source: "mal", id: MAL_ID } as const;

function upstreamSnapshot(fetchedAt: number) {
	return {
		entries: {},
		aniListCrosswalks: {
			[`mal:${MAL_ID}`]: ANILIST_ID,
		},
		fetchedAt,
	};
}

describe("canonical mapping regression", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await browser.storage.local.set({
			"mapping:manual": {
				sonarr: {
					[ANILIST_ID]: {
						mapping: { providerId: LEGACY_TVDB_ID },
					},
				},
				radarr: {},
			},
			"mapping:auto": { sonarr: {}, radarr: {} },
			"mapping:upstream": upstreamSnapshot(Date.now()),
		});
	});

	it("stores a linked MAL decision under its durable AniList identity", async () => {
		await expect(
			mappingService.getMapping("sonarr", MAL_SOURCE),
		).resolves.toMatchObject({
			kind: "mapped",
			source: "manual",
			providerId: LEGACY_TVDB_ID,
		});

		await mappingHandlers.setManualMapping({
			source: MAL_SOURCE,
			provider: "sonarr",
			providerId: MAL_TVDB_ID,
		});

		const manualBeforeRefresh = await browser.storage.local.get("mapping:manual");
		expect(manualBeforeRefresh).toEqual({
			"mapping:manual": {
				sonarr: {
					[`anilist:${ANILIST_ID}`]: {
						mapping: { providerId: MAL_TVDB_ID },
					},
				},
				radarr: {},
			},
		});
		await expect(
			mappingService.getMapping("sonarr", MAL_SOURCE),
		).resolves.toMatchObject({ providerId: MAL_TVDB_ID });
		await expect(
			mappingService.getMapping("sonarr", {
				source: "anilist",
				id: ANILIST_ID,
			}),
		).resolves.toMatchObject({ providerId: MAL_TVDB_ID });

		await browser.storage.local.set({
			"mapping:upstream": upstreamSnapshot(Date.now() + 1),
		});
		await expect(
			browser.storage.local.get("mapping:manual"),
		).resolves.toEqual(manualBeforeRefresh);
		await expect(
			mappingService.getMapping("sonarr", MAL_SOURCE),
		).resolves.toMatchObject({ providerId: MAL_TVDB_ID });

	});
});
