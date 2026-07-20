/** Tests for Sonarr RPC handler wiring that is easy to regress during client migration. */
// src/rpc/handlers/sonarr.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTvdbId } from "@/providers/schemas";
import type { ProviderCredentials } from "@/providers/types";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	SonarrSeriesId,
} from "@/providers/schemas";
import { ErrorCode } from "@/shared/errors/error.types";
import { sonarrHandlers } from "./sonarr.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};
const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseSonarrSeriesId = (value: number) => value as SonarrSeriesId;

const sonarrClientMock = vi.hoisted(() => ({
	findSeriesByTvdbId: vi.fn(),
	getQualityProfiles: vi.fn(),
	getRootFolders: vi.fn(),
	getTags: vi.fn(),
	lookupSeries: vi.fn(),
	lookupSeriesByTvdbId: vi.fn(),
}));

const apiServicesMock = vi.hoisted(() => ({
	bumpLibraryRevision: vi.fn(),
	mappingService: {
		getLinkedAniListIds: vi.fn(),
		resolveMapping: vi.fn(),
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
vi.mock("@/background/api-services", () => ({
	...apiServicesMock,
	sonarrClient: sonarrClientMock,
}));

vi.mock("@/background/provider-config", () => providerConfigMock);

vi.mock("@/providers/sonarr/add", () => ({
	addSonarrSeries: addSonarrSeriesMock,
}));

vi.mock("@/providers/sonarr/edit", () => ({
	updateSonarrSeries: updateSonarrSeriesMock,
}));

describe("sonarrHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiServicesMock.mappingService.getLinkedAniListIds.mockResolvedValue([]);
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
			mapping: { kind: "unmapped", hadResolveAttempt: false },
			isInLibrary: null,
		});

		expect(
			apiServicesMock.mappingService.resolveMapping,
		).not.toHaveBeenCalled();
	});

	it("returns mapped Sonarr library status with raw series", async () => {
		const anilistId = parseAniListId(100);
		const tvdbId = parseTvdbId(200);
		const series = {
			id: parseSonarrSeriesId(5),
			title: "Mapped Series",
			titleSlug: "mapped-series",
			tvdbId,
			status: "continuing" as const,
		};
		providerConfigMock.getProviderConfig.mockResolvedValue(credentials);
		apiServicesMock.mappingService.resolveMapping.mockResolvedValue({
			kind: "mapped",
			source: "manual",
			providerId: tvdbId,
		});
		apiServicesMock.sonarrLibrary.getSeriesLibraryStatusByTvdbId.mockResolvedValue(
			{
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: true,
				series,
			},
		);

		await expect(
			sonarrHandlers.getSeriesStatus({
				anilistId,
				title: "Mapped Series",
				force_verify: true,
				force_mapping_retry: true,
			}),
		).resolves.toMatchObject({
			mapping: {
				kind: "mapped",
				source: "manual",
				providerId: tvdbId,
			},
			isInLibrary: true,
			series,
		});
		expect(apiServicesMock.mappingService.resolveMapping).toHaveBeenCalledWith(
			"sonarr",
			{ source: "anilist", id: anilistId },
			{
				forceRetry: true,
				title: "Mapped Series",
			},
		);
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
