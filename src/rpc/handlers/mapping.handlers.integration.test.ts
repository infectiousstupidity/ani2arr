/** Regression test for canonical mapping behavior across the RPC boundary. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { parseAniListId } from "@/anilist/types";
import { mappingService, sonarrLibrary } from "@/background/api-services";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTvdbId, type SonarrSeriesId } from "@/providers/schemas";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import type { MappingListGroup } from "@/rpc/types";
import { mappingHandlers } from "./mapping.handlers";

const getProviderConfigMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/background/provider-config", () => ({
	getProviderConfig: getProviderConfigMock,
}));

vi.mock("@/background/mapping-refresh", () => ({
	refreshMappingPipeline: vi.fn(),
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpMappingsRevision: bumpMappingsRevisionMock,
}));

const BLACK_TORCH_ANILIST_ID = parseAniListId(187_538);
const BLACK_TORCH_MAL_ID = parseMyAnimeListId(61_169);
const BLACK_TORCH_TVDB_ID = parseTvdbId(461_194);
const FRIEREN_TVDB_ID = parseTvdbId(442_536);
const MAL_SOURCE = { source: "mal", id: BLACK_TORCH_MAL_ID } as const;
const credentials = { url: "http://localhost", apiKey: "api-key" };

function sonarrSeries(
	tvdbId: ReturnType<typeof parseTvdbId>,
	title: string,
): SonarrSeriesSnapshot {
	return {
		id: Number(tvdbId) as SonarrSeriesId,
		tvdbId,
		title,
		titleSlug: title.toLowerCase().replaceAll(" ", "-"),
		status: "continuing",
	};
}

function findBlackTorchRows(groups: readonly MappingListGroup[]) {
	return groups.flatMap((group) =>
		group.rows
			.filter((row) => row.anilistId === BLACK_TORCH_ANILIST_ID)
			.map((row) => ({ group, row })),
	);
}

describe("canonical AniList mapping regression", () => {
	beforeEach(async () => {
		getProviderConfigMock.mockResolvedValue(credentials);
		vi.mocked(sonarrLibrary.getSeriesSnapshots).mockResolvedValue([
			sonarrSeries(BLACK_TORCH_TVDB_ID, "BLACK TORCH"),
			sonarrSeries(FRIEREN_TVDB_ID, "Frieren: Beyond Journey's End"),
		]);
		await browser.storage.local.set({
			"mapping:upstream": {
				entries: {
					[`anilist:${BLACK_TORCH_ANILIST_ID}`]: [
						{ kind: "tvdb-show", id: BLACK_TORCH_TVDB_ID },
					],
				},
				aniListCrosswalks: {
					[`mal:${BLACK_TORCH_MAL_ID}`]: BLACK_TORCH_ANILIST_ID,
				},
				fetchedAt: Date.now(),
			},
		});
	});

	it("keeps BLACK TORCH and its MAL alias on one mapping through override and clear", async () => {
		await mappingHandlers.setManualMapping({
			source: MAL_SOURCE,
			provider: "sonarr",
			providerId: FRIEREN_TVDB_ID,
		});

		await expect(
			mappingService.getMapping("sonarr", {
				source: "anilist",
				id: BLACK_TORCH_ANILIST_ID,
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "manual",
			providerId: FRIEREN_TVDB_ID,
		});

		const manualGroups = await mappingHandlers.getMappings();
		const manualRows = findBlackTorchRows(manualGroups);

		expect(manualRows).toHaveLength(1);
		expect(manualRows[0]).toMatchObject({
			group: {
				provider: "sonarr",
				providerId: FRIEREN_TVDB_ID,
				providerMeta: { title: "Frieren: Beyond Journey's End" },
			},
			row: {
				anilistId: BLACK_TORCH_ANILIST_ID,
				aliases: [MAL_SOURCE],
				result: {
					kind: "mapped",
					source: "manual",
					providerId: FRIEREN_TVDB_ID,
				},
			},
		});
		expect(
			manualGroups.some(
				(group) =>
					group.providerId === BLACK_TORCH_TVDB_ID &&
					group.rows.some((row) => row.anilistId === BLACK_TORCH_ANILIST_ID),
			),
		).toBe(false);

		await mappingHandlers.clearManualMapping({
			source: MAL_SOURCE,
			provider: "sonarr",
		});

		await expect(
			mappingService.getMapping("sonarr", {
				source: "anilist",
				id: BLACK_TORCH_ANILIST_ID,
			}),
		).resolves.toEqual({
			kind: "mapped",
			source: "upstream",
			providerId: BLACK_TORCH_TVDB_ID,
		});

		const restoredRows = findBlackTorchRows(
			await mappingHandlers.getMappings(),
		);

		expect(restoredRows).toHaveLength(1);
		expect(restoredRows[0]).toMatchObject({
			group: {
				provider: "sonarr",
				providerId: BLACK_TORCH_TVDB_ID,
				providerMeta: { title: "BLACK TORCH" },
				rows: [expect.anything()],
			},
			row: {
				anilistId: BLACK_TORCH_ANILIST_ID,
				aliases: [MAL_SOURCE],
				result: {
					kind: "mapped",
					source: "upstream",
					providerId: BLACK_TORCH_TVDB_ID,
				},
			},
		});
		expect(restoredRows[0]?.group.rows).toHaveLength(1);
		await expect(
			mappingService.getLinkedAniListIds("sonarr", BLACK_TORCH_TVDB_ID),
		).resolves.toEqual([BLACK_TORCH_ANILIST_ID]);
	});
});
