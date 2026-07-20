/** Tests for Radarr RPC handler resource loading. */
// src/rpc/handlers/radarr.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import type { ProviderCredentials } from "@/providers/types";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
} from "@/providers/schemas";
import { radarrHandlers } from "./radarr.handlers";

const credentials: ProviderCredentials = {
	url: "https://radarr.example",
	apiKey: "secret",
};
const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseRadarrMovieId = (value: number) => value as RadarrMovieId;

const radarrClientMock = vi.hoisted(() => ({
	findMovieByTmdbId: vi.fn(),
	getQualityProfiles: vi.fn(),
	getRootFolders: vi.fn(),
	getTags: vi.fn(),
	lookupMovieByTmdbId: vi.fn(),
	lookupMovies: vi.fn(),
}));

const apiServicesMock = vi.hoisted(() => ({
	bumpLibraryRevision: vi.fn(),
	mappingService: {
		getLinkedAniListIds: vi.fn(),
		resolveMapping: vi.fn(),
	},
	radarrClient: radarrClientMock,
	radarrLibrary: {
		clearMovieSnapshotCache: vi.fn(),
		getMovieLibraryStatusByTmdbId: vi.fn(),
		getMovieSnapshots: vi.fn(),
		upsertMovieSnapshot: vi.fn(),
	},
	scheduleLibraryRefresh: vi.fn(),
}));

const providerConfigMock = vi.hoisted(() => ({
	getProviderConfig: vi.fn(),
	requireProviderConfig: vi.fn(),
	requireProviderCredentials: vi.fn(),
}));

const addRadarrMovieMock = vi.hoisted(() => vi.fn());
const updateRadarrMovieMock = vi.hoisted(() => vi.fn());
vi.mock("@/background/api-services", () => ({
	...apiServicesMock,
	radarrClient: radarrClientMock,
}));

vi.mock("@/background/provider-config", () => providerConfigMock);

vi.mock("@/providers/radarr/add", () => ({
	addRadarrMovie: addRadarrMovieMock,
}));

vi.mock("@/providers/radarr/edit", () => ({
	updateRadarrMovie: updateRadarrMovieMock,
}));

describe("radarrHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiServicesMock.mappingService.getLinkedAniListIds.mockResolvedValue([]);
	});

	it("loads Radarr form resources through the Radarr client", async () => {
		const qualityProfiles = [
			{ id: parseProviderQualityProfileId(1), name: "HD" },
		];
		const rootFolders = [{ id: 2, path: "/movies", freeSpace: 100 }];
		const tags = [{ id: parseProviderTagId(3), label: "anime" }];
		radarrClientMock.getQualityProfiles.mockResolvedValue(qualityProfiles);
		radarrClientMock.getRootFolders.mockResolvedValue(rootFolders);
		radarrClientMock.getTags.mockResolvedValue(tags);

		await expect(
			radarrHandlers.getRadarrFormResources({ credentials }),
		).resolves.toEqual({
			qualityProfiles,
			rootFolders,
			tags,
		});

		expect(radarrClientMock.getQualityProfiles).toHaveBeenCalledWith(
			credentials,
		);
		expect(radarrClientMock.getRootFolders).toHaveBeenCalledWith(credentials);
		expect(radarrClientMock.getTags).toHaveBeenCalledWith(credentials);
	});

	it("returns provider-not-configured when Radarr status has no configured credentials", async () => {
		providerConfigMock.getProviderConfig.mockResolvedValue(null);

		await expect(
			radarrHandlers.getMovieStatus({ anilistId: parseAniListId(100) }),
		).resolves.toEqual({
			mapping: { kind: "unmapped", hadResolveAttempt: false },
			isInLibrary: null,
		});

		expect(
			apiServicesMock.mappingService.resolveMapping,
		).not.toHaveBeenCalled();
	});

	it("returns mapped Radarr library status with raw movie", async () => {
		const anilistId = parseAniListId(100);
		const tmdbId = parseTmdbId(200);
		const movie = {
			id: parseRadarrMovieId(5),
			title: "Mapped Movie",
			titleSlug: "mapped-movie",
			tmdbId,
			year: 2024,
			hasFile: true,
		};
		providerConfigMock.getProviderConfig.mockResolvedValue(credentials);
		apiServicesMock.mappingService.resolveMapping.mockResolvedValue({
			kind: "mapped",
			source: "upstream",
			providerId: tmdbId,
		});
		apiServicesMock.radarrLibrary.getMovieLibraryStatusByTmdbId.mockResolvedValue(
			{
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: true,
				movie,
			},
		);

		await expect(
			radarrHandlers.getMovieStatus({
				anilistId,
				title: "Mapped Movie",
				force_verify: true,
				force_mapping_retry: true,
			}),
		).resolves.toMatchObject({
			mapping: {
				kind: "mapped",
				source: "upstream",
				providerId: tmdbId,
			},
			isInLibrary: true,
			movie,
		});
		expect(apiServicesMock.mappingService.resolveMapping).toHaveBeenCalledWith(
			"radarr",
			{ source: "anilist", id: anilistId },
			{
				forceRetry: true,
				title: "Mapped Movie",
			},
		);
	});

	it("updates Radarr cache and revision after add", async () => {
		const anilistId = parseAniListId(100);
		const tmdbId = parseTmdbId(200);
		const form = {
			rootFolderPath: "/movies",
			qualityProfileId: parseProviderQualityProfileId(1),
			minimumAvailability: "released" as const,
			tags: [],
			freeformTags: [],
			addOptions: {
				monitor: "movieOnly" as const,
				searchForMovie: false,
			},
		};
		const created = {
			id: parseRadarrMovieId(5),
			title: "Added Movie",
			titleSlug: "added-movie",
			tmdbId,
		};
		providerConfigMock.requireProviderConfig.mockResolvedValue({
			credentials,
			options: { providers: { radarr: { defaults: form } } },
		});
		addRadarrMovieMock.mockResolvedValue(created);

		await expect(
			radarrHandlers.addToRadarr({
				anilistId,
				tmdbId,
				title: "Added Movie",
				form,
			}),
		).resolves.toBe(created);

		expect(
			apiServicesMock.radarrLibrary.upsertMovieSnapshot,
		).toHaveBeenCalled();
		expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
			"radarr",
		);
		expect(apiServicesMock.bumpLibraryRevision).toHaveBeenCalledWith("radarr");
	});

	it("updates Radarr cache and revision after update", async () => {
		const tmdbId = parseTmdbId(200);
		const updated = {
			id: parseRadarrMovieId(5),
			title: "Updated Movie",
			titleSlug: "updated-movie",
			tmdbId,
		};
		providerConfigMock.requireProviderCredentials.mockResolvedValue(
			credentials,
		);
		updateRadarrMovieMock.mockResolvedValue(updated);

		await expect(
			radarrHandlers.updateRadarrMovie({
				anilistId: parseAniListId(100),
				tmdbId,
				title: "Updated Movie",
				form: {
					rootFolderPath: "/movies",
					qualityProfileId: parseProviderQualityProfileId(1),
					minimumAvailability: "released",
					tags: [],
					freeformTags: [],
				},
			}),
		).resolves.toBe(updated);

		expect(
			apiServicesMock.radarrLibrary.upsertMovieSnapshot,
		).toHaveBeenCalled();
		expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
			"radarr",
		);
		expect(apiServicesMock.bumpLibraryRevision).toHaveBeenCalledWith("radarr");
	});
});
