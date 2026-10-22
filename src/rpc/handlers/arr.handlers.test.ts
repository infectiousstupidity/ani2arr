/** Focused contract tests for shared Arr RPC orchestration. */
// src/rpc/handlers/arr.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import {
	type ProviderQualityProfileId,
	parseTmdbId,
	parseTvdbId,
	type RadarrMovieId,
	type SonarrSeriesId,
} from "@/providers/schemas";
import type { ProviderCredentials } from "@/providers/types";
import { ErrorCode } from "@/shared/errors/error.types";
import { radarrHandlers } from "./radarr.handlers";
import { sonarrHandlers } from "./sonarr.handlers";

const apiServicesMock = vi.hoisted(() => ({
	mappingService: {
		resolveMapping: vi.fn(),
	},
	radarrClient: {},
	radarrLibrary: {
		upsertMovieSnapshot: vi.fn(),
	},
	scheduleLibraryRefresh: vi.fn(),
	sonarrClient: {},
	sonarrLibrary: {
		upsertSeriesSnapshot: vi.fn(),
	},
}));

const providerConfigMock = vi.hoisted(() => ({
	getProviderConfig: vi.fn(),
	requireProviderConfig: vi.fn(),
	requireProviderCredentials: vi.fn(),
}));

const addRadarrMovieMock = vi.hoisted(() => vi.fn());
const addSonarrSeriesMock = vi.hoisted(() => vi.fn());
const updateRadarrMovieMock = vi.hoisted(() => vi.fn());
const updateSonarrSeriesMock = vi.hoisted(() => vi.fn());
const bumpProviderLibraryRevisionMock = vi.hoisted(() => vi.fn());

vi.mock("@/background/api-services", () => apiServicesMock);
vi.mock("@/background/provider-config", () => providerConfigMock);

vi.mock("@/providers/radarr/add", () => ({
	addRadarrMovie: addRadarrMovieMock,
}));

vi.mock("@/providers/radarr/edit", () => ({
	updateRadarrMovie: updateRadarrMovieMock,
}));

vi.mock("@/providers/sonarr/add", () => ({
	addSonarrSeries: addSonarrSeriesMock,
}));

vi.mock("@/providers/sonarr/edit", () => ({
	updateSonarrSeries: updateSonarrSeriesMock,
}));

vi.mock("@/rpc/revision-signals", () => ({
	bumpProviderLibraryRevision: bumpProviderLibraryRevisionMock,
}));

const aid = parseAniListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

const credentials: ProviderCredentials = {
	url: "https://arr.example",
	apiKey: "secret",
};

const qualityProfileId = 1 as ProviderQualityProfileId;

const sonarrForm = {
	rootFolderPath: "/anime",
	qualityProfileId,
	seriesType: "anime" as const,
	seasonFolder: true,
	tags: [],
	freeformTags: [],
};

const sonarrAddForm = {
	...sonarrForm,
	addOptions: {
		monitor: "all" as const,
		searchForMissingEpisodes: true,
		searchForCutoffUnmetEpisodes: false,
	},
};

const radarrForm = {
	rootFolderPath: "/movies",
	qualityProfileId,
	minimumAvailability: "released" as const,
	tags: [],
	freeformTags: [],
};

const radarrAddForm = {
	...radarrForm,
	addOptions: {
		monitor: "movieOnly" as const,
		searchForMovie: false,
	},
};

const createdSeries = {
	id: 5 as SonarrSeriesId,
	title: "Added Series",
	titleSlug: "added-series",
	tvdbId: tvdb(200),
};

const createdMovie = {
	id: 5 as RadarrMovieId,
	title: "Added Movie",
	titleSlug: "added-movie",
	tmdbId: tmdb(300),
};

const providerOptions = {
	providers: {
		sonarr: { defaults: sonarrAddForm },
		radarr: { defaults: radarrAddForm },
	},
};

describe("Arr RPC handlers", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		apiServicesMock.sonarrLibrary.upsertSeriesSnapshot.mockResolvedValue(true);
		apiServicesMock.radarrLibrary.upsertMovieSnapshot.mockResolvedValue(true);
	});

	it.each([
		{
			name: "Sonarr",
			run: () =>
				sonarrHandlers.getSeriesStatus({
					anilistId: aid(100),
				}),
		},
		{
			name: "Radarr",
			run: () =>
				radarrHandlers.getMovieStatus({
					anilistId: aid(100),
				}),
		},
	])(
		"returns unknown status without resolving when $name is unconfigured",
		async ({ run }) => {
			providerConfigMock.getProviderConfig.mockResolvedValue(null);

			await expect(run()).resolves.toEqual({
				mapping: {
					kind: "unmapped",
					hadResolveAttempt: false,
				},
				isInLibrary: null,
			});

			expect(
				apiServicesMock.mappingService.resolveMapping,
			).not.toHaveBeenCalled();
		},
	);

	it.each([
		{
			name: "Sonarr",
			provider: "sonarr" as const,
			created: createdSeries,
			setup: () => {
				addSonarrSeriesMock.mockResolvedValue(createdSeries);
			},
			run: () =>
				sonarrHandlers.addToSonarr({
					anilistId: aid(100),
					tvdbId: createdSeries.tvdbId,
					title: createdSeries.title,
					form: sonarrAddForm,
				}),
			expectCacheUpdate: () => {
				expect(
					apiServicesMock.sonarrLibrary.upsertSeriesSnapshot,
				).toHaveBeenCalledWith(
					expect.objectContaining({
						id: createdSeries.id,
						tvdbId: createdSeries.tvdbId,
						title: createdSeries.title,
					}),
					credentials,
				);
			},
		},
		{
			name: "Radarr",
			provider: "radarr" as const,
			created: createdMovie,
			setup: () => {
				addRadarrMovieMock.mockResolvedValue(createdMovie);
			},
			run: () =>
				radarrHandlers.addToRadarr({
					anilistId: aid(100),
					tmdbId: createdMovie.tmdbId,
					title: createdMovie.title,
					form: radarrAddForm,
				}),
			expectCacheUpdate: () => {
				expect(
					apiServicesMock.radarrLibrary.upsertMovieSnapshot,
				).toHaveBeenCalledWith(
					expect.objectContaining({
						id: createdMovie.id,
						tmdbId: createdMovie.tmdbId,
						title: createdMovie.title,
					}),
					credentials,
				);
			},
		},
	])(
		"updates cache and revision after adding to $name",
		async ({ provider, created, setup, run, expectCacheUpdate }) => {
			providerConfigMock.requireProviderConfig.mockResolvedValue({
				credentials,
				options: providerOptions,
			});
			setup();

			await expect(run()).resolves.toBe(created);

			expectCacheUpdate();
			expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
				provider,
			);
			expect(bumpProviderLibraryRevisionMock).toHaveBeenCalledWith(provider);
		},
	);

	it("refreshes Sonarr after a partial-success update failure", async () => {
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
				anilistId: aid(100),
				tvdbId: tvdb(200),
				title: "Updated Series",
				form: sonarrForm,
			}),
		).rejects.toMatchObject({
			code: ErrorCode.API_ERROR,
			details: { partialSuccess: true },
		});

		expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
			"sonarr",
		);
		expect(
			apiServicesMock.sonarrLibrary.upsertSeriesSnapshot,
		).not.toHaveBeenCalled();
		expect(bumpProviderLibraryRevisionMock).not.toHaveBeenCalled();
	});
});
