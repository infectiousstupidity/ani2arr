/** Tests for Sonarr RPC handler wiring that is easy to regress during client migration. */
// src/rpc/handlers/sonarr.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist";
import {
	parseProviderQualityProfileId,
	parseSonarrSeriesId,
	parseProviderTagId,
	parseTvdbId,
	type ProviderCredentials,
} from "@/providers";
import { ErrorCode } from "@/shared/errors";
import { sonarrHandlers } from "./sonarr.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};

const sonarrClientMock = vi.hoisted(() => ({
	findSeriesByTvdbId: vi.fn(),
	getQualityProfiles: vi.fn(),
	getRootFolders: vi.fn(),
	getTags: vi.fn(),
	lookupSeries: vi.fn(),
	lookupSeriesByTvdbId: vi.fn(),
}));

const apiServicesMock = vi.hoisted(() => ({
	anibridgeMappingStore: { getAniListIdsForTvdb: vi.fn() },
	bumpLibraryRevision: vi.fn(),
	manualMappingService: {
		getLinkedAniListIds: vi.fn(),
		has: vi.fn(),
	},
	manualMappingsReady: Promise.resolve(),
	mappingService: {
		getAutoMapping: vi.fn(),
		prioritizeAniListMedia: vi.fn(),
		resolveProviderId: vi.fn(),
	},
	scheduleLibraryRefresh: vi.fn(),
	sonarrClient: sonarrClientMock,
	sonarrLibrary: {
		clearSeriesSnapshotCache: vi.fn(),
		getSeriesLibraryStatusByTvdbId: vi.fn(),
		getSeriesSnapshots: vi.fn(),
		upsertSeriesSnapshot: vi.fn(),
	},
}));

const providerConfigMock = vi.hoisted(() => ({
	getProviderConfig: vi.fn(),
	requireProviderConfig: vi.fn(),
	requireProviderCredentials: vi.fn(),
}));

const addSonarrSeriesMock = vi.hoisted(() => vi.fn());
const updateSonarrSeriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api/api-services", () => ({
	...apiServicesMock,
	sonarrClient: sonarrClientMock,
}));

vi.mock("@/background/api/provider-config", () => providerConfigMock);

vi.mock("@/providers/sonarr/add", () => ({
	addSonarrSeries: addSonarrSeriesMock,
}));

vi.mock("@/providers/sonarr/edit", () => ({
	updateSonarrSeries: updateSonarrSeriesMock,
}));

describe("sonarrHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiServicesMock.anibridgeMappingStore.getAniListIdsForTvdb.mockReturnValue(
			[],
		);
		apiServicesMock.manualMappingService.getLinkedAniListIds.mockReturnValue(
			[],
		);
		apiServicesMock.manualMappingService.has.mockReturnValue(false);
	});

	it("loads Sonarr form resources through the current Sonarr client", async () => {
		const qualityProfiles = [
			{ id: parseProviderQualityProfileId(1), name: "HD" },
		];
		const rootFolders = [{ id: 2, path: "/anime", freeSpace: 100 }];
		const tags = [{ id: parseProviderTagId(3), label: "anime" }];
		sonarrClientMock.getQualityProfiles.mockResolvedValue(qualityProfiles);
		sonarrClientMock.getRootFolders.mockResolvedValue(rootFolders);
		sonarrClientMock.getTags.mockResolvedValue(tags);

		await expect(
			sonarrHandlers.getSonarrFormResources({ credentials }),
		).resolves.toEqual({
			qualityProfiles,
			rootFolders,
			tags,
		});

		expect(sonarrClientMock.getQualityProfiles).toHaveBeenCalledWith(
			credentials,
		);
		expect(sonarrClientMock.getRootFolders).toHaveBeenCalledWith(credentials);
		expect(sonarrClientMock.getTags).toHaveBeenCalledWith(credentials);
	});

	it("returns provider-not-configured when Sonarr status has no configured credentials", async () => {
		providerConfigMock.getProviderConfig.mockResolvedValue(null);

		await expect(
			sonarrHandlers.getSeriesStatus({ anilistId: parseAniListId(100) }),
		).resolves.toEqual({
			providerId: null,
			providerMappingState: "unknown",
			isInLibrary: null,
			mappingUnknownReason: "provider-not-configured",
			manualMappingActive: false,
		});

		expect(
			apiServicesMock.mappingService.resolveProviderId,
		).not.toHaveBeenCalled();
	});

	it("returns mapped Sonarr library status with linked IDs and target summary", async () => {
		const anilistId = parseAniListId(100);
		const linkedAnilistId = parseAniListId(101);
		const tvdbId = parseTvdbId(200);
		const series = {
			id: parseSonarrSeriesId(5),
			title: "Mapped Series",
			titleSlug: "mapped-series",
			tvdbId,
			status: "continuing" as const,
		};
		providerConfigMock.getProviderConfig.mockResolvedValue(credentials);
		apiServicesMock.mappingService.resolveProviderId.mockResolvedValue({
			providerId: tvdbId,
			reason: "manual-override",
		});
		apiServicesMock.sonarrLibrary.getSeriesLibraryStatusByTvdbId.mockResolvedValue(
			{
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: true,
				series,
			},
		);
		apiServicesMock.manualMappingService.getLinkedAniListIds.mockReturnValue([
			anilistId,
		]);
		apiServicesMock.anibridgeMappingStore.getAniListIdsForTvdb.mockReturnValue([
			linkedAnilistId,
		]);

		await expect(
			sonarrHandlers.getSeriesStatus({
				anilistId,
				title: "Mapped Series",
				force_verify: true,
			}),
		).resolves.toMatchObject({
			providerId: tvdbId,
			providerMappingState: "mapped",
			isInLibrary: true,
			mappingSource: "manual",
			mappingReason: "manual-override",
			linkedAniListIds: [anilistId, linkedAnilistId],
			targetSummary: {
				provider: "sonarr",
				providerId: tvdbId,
				title: "Mapped Series",
				isInLibrary: true,
				providerRouteSlug: "mapped-series",
				linkedAniListIds: [anilistId, linkedAnilistId],
			},
		});
	});

	it("updates Sonarr cache and revision after add", async () => {
		const anilistId = parseAniListId(100);
		const tvdbId = parseTvdbId(200);
		const form = {
			rootFolderPath: "/anime",
			qualityProfileId: parseProviderQualityProfileId(1),
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [],
			freeformTags: [],
			addOptions: {
				monitor: "all" as const,
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		};
		const created = {
			id: parseSonarrSeriesId(5),
			title: "Added Series",
			titleSlug: "added-series",
			tvdbId,
		};
		providerConfigMock.requireProviderConfig.mockResolvedValue({
			credentials,
			options: { providers: { sonarr: { defaults: form } } },
		});
		addSonarrSeriesMock.mockResolvedValue(created);

		await expect(
			sonarrHandlers.addToSonarr({
				anilistId,
				tvdbId,
				title: "Added Series",
				form,
			}),
		).resolves.toBe(created);

		expect(
			apiServicesMock.sonarrLibrary.upsertSeriesSnapshot,
		).toHaveBeenCalled();
		expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
			"sonarr",
		);
		expect(apiServicesMock.bumpLibraryRevision).toHaveBeenCalledWith("sonarr");
	});

	it("bumps Sonarr revision after partial-success update failure", async () => {
		const partialSuccessError = {
			code: ErrorCode.API_ERROR,
			message: "Update partly succeeded",
			userMessage: "Update partly succeeded",
			details: { partialSuccess: true },
			timestamp: Date.now(),
		};
		providerConfigMock.requireProviderCredentials.mockResolvedValue(
			credentials,
		);
		updateSonarrSeriesMock.mockRejectedValue(partialSuccessError);

		await expect(
			sonarrHandlers.updateSonarrSeries({
				anilistId: parseAniListId(100),
				tvdbId: parseTvdbId(200),
				title: "Updated Series",
				form: {
					rootFolderPath: "/anime",
					qualityProfileId: parseProviderQualityProfileId(1),
					seriesType: "anime",
					seasonFolder: true,
					tags: [],
					freeformTags: [],
				},
			}),
		).rejects.toBe(partialSuccessError);

		expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
			"sonarr",
		);
		expect(apiServicesMock.bumpLibraryRevision).toHaveBeenCalledWith("sonarr");
	});
});
