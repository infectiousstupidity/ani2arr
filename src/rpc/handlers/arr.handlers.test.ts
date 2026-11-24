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
		getLinkedAniListIdsByProviderIds: vi.fn(),
	},
	radarrClient: { lookupMovies: vi.fn() },
	radarrLibrary: {
		getMovieSnapshots: vi.fn(),
		upsertMovieSnapshot: vi.fn(),
	},
	scheduleLibraryRefresh: vi.fn(),
	sonarrClient: { lookupSeries: vi.fn() },
	sonarrLibrary: {
		getSeriesSnapshots: vi.fn(),
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

	const searches = [
		{
			provider: "sonarr",
			result: createdSeries,
			id: createdSeries.tvdbId,
			idsKey: "libraryTvdbIds",
			linkedKey: "linkedAniListIdsByTvdbId",
			lookup: apiServicesMock.sonarrClient.lookupSeries,
			library: apiServicesMock.sonarrLibrary.getSeriesSnapshots,
			run: () => sonarrHandlers.searchSonarr({ term: "Series" }),
		},
		{
			provider: "radarr",
			result: createdMovie,
			id: createdMovie.tmdbId,
			idsKey: "libraryTmdbIds",
			linkedKey: "linkedAniListIdsByTmdbId",
			lookup: apiServicesMock.radarrClient.lookupMovies,
			library: apiServicesMock.radarrLibrary.getMovieSnapshots,
			run: () => radarrHandlers.searchRadarr({ term: "Movie" }),
		},
	];

	it.each(searches)(
		"preserves $provider results and linked IDs when the library is unavailable",
		async ({ provider, result, id, idsKey, linkedKey, lookup, library, run }) => {
			providerConfigMock.requireProviderCredentials.mockResolvedValue(credentials);
			lookup.mockResolvedValue([result]);
			library.mockRejectedValue(new Error(`library failure ${credentials.apiKey}`));
			apiServicesMock.mappingService.getLinkedAniListIdsByProviderIds.mockResolvedValue(
				new Map([[id, [aid(100)]]]),
			);
			const log = vi.spyOn(console, "error").mockImplementation(() => {});

			await expect(run()).resolves.toEqual({
				results: [result],
				[idsKey]: null,
				[linkedKey]: { [id]: [100] },
			});
			expect(apiServicesMock.mappingService.getLinkedAniListIdsByProviderIds)
				.toHaveBeenCalledWith(provider, new Set([id]));
			expect(log).toHaveBeenCalled();
			expect(JSON.stringify(log.mock.calls)).not.toContain(credentials.apiKey);
		},
	);

	it.each(searches)("propagates $provider lookup errors", async ({ lookup, library, run }) => {
		providerConfigMock.requireProviderCredentials.mockResolvedValue(credentials);
		const error = new Error("lookup failed");
		lookup.mockRejectedValue(error);
		library.mockResolvedValue([]);

		await expect(run()).rejects.toBe(error);
	});

	it.each([
		{
			name: "Sonarr",
				run: () =>
					sonarrHandlers.getSeriesStatus({
						source: { source: "anilist", id: aid(100) },
				}),
		},
		{
			name: "Radarr",
				run: () =>
					radarrHandlers.getMovieStatus({
						source: { source: "anilist", id: aid(100) },
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
						source: { source: "anilist", id: aid(100) },
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
						source: { source: "anilist", id: aid(100) },
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

	const mutations = [
		{
			name: "Sonarr add",
			provider: "sonarr",
			result: createdSeries,
			remote: addSonarrSeriesMock,
			upsert: apiServicesMock.sonarrLibrary.upsertSeriesSnapshot,
			run: () =>
				sonarrHandlers.addToSonarr({
					source: { source: "anilist", id: aid(100) },
					tvdbId: tvdb(200),
					title: "Series",
					form: sonarrAddForm,
				}),
		},
		{
			name: "Sonarr update",
			provider: "sonarr",
			result: createdSeries,
			remote: updateSonarrSeriesMock,
			upsert: apiServicesMock.sonarrLibrary.upsertSeriesSnapshot,
			run: () =>
				sonarrHandlers.updateSonarrSeries({
					source: { source: "anilist", id: aid(100) },
					tvdbId: tvdb(200),
					title: "Series",
					form: sonarrForm,
				}),
		},
		{
			name: "Radarr add",
			provider: "radarr",
			result: createdMovie,
			remote: addRadarrMovieMock,
			upsert: apiServicesMock.radarrLibrary.upsertMovieSnapshot,
			run: () =>
				radarrHandlers.addToRadarr({
					source: { source: "anilist", id: aid(100) },
					tmdbId: tmdb(300),
					title: "Movie",
					form: radarrAddForm,
				}),
		},
		{
			name: "Radarr update",
			provider: "radarr",
			result: createdMovie,
			remote: updateRadarrMovieMock,
			upsert: apiServicesMock.radarrLibrary.upsertMovieSnapshot,
			run: () =>
				radarrHandlers.updateRadarrMovie({
					source: { source: "anilist", id: aid(100) },
					tmdbId: tmdb(300),
					title: "Movie",
					form: radarrForm,
				}),
		},
	];

	it.each(mutations)(
		"returns $name success when local maintenance fails",
		async ({ provider, result, remote, upsert, run }) => {
			providerConfigMock.requireProviderConfig.mockResolvedValue({
				credentials,
				options: providerOptions,
			});
			providerConfigMock.requireProviderCredentials.mockResolvedValue(
				credentials,
			);
			remote.mockResolvedValue(result);
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			try {
				for (const failure of [upsert, bumpProviderLibraryRevisionMock]) {
					vi.clearAllMocks();
					failure.mockRejectedValueOnce(
						new Error(`cache failure ${credentials.apiKey}`),
					);
					await expect(run()).resolves.toBe(result);
					expect(apiServicesMock.scheduleLibraryRefresh).toHaveBeenCalledWith(
						provider,
					);
					expect(upsert).toHaveBeenCalledOnce();
					if (failure === upsert) {
						expect(bumpProviderLibraryRevisionMock).not.toHaveBeenCalled();
					} else {
						expect(bumpProviderLibraryRevisionMock).toHaveBeenCalledWith(
							provider,
						);
					}
					expect(log).toHaveBeenCalled();
					expect(JSON.stringify(log.mock.calls)).not.toContain(
						credentials.apiKey,
					);
				}
			} finally {
				log.mockRestore();
			}
		},
	);

	it.each(mutations)(
		"rejects remote $name failures without cache maintenance",
		async ({ remote, upsert, run }) => {
			providerConfigMock.requireProviderConfig.mockResolvedValue({
				credentials,
				options: providerOptions,
			});
			providerConfigMock.requireProviderCredentials.mockResolvedValue(
				credentials,
			);
			remote.mockRejectedValue(new Error("remote failure"));
			await expect(run()).rejects.toBeDefined();
			expect(upsert).not.toHaveBeenCalled();
			expect(apiServicesMock.scheduleLibraryRefresh).not.toHaveBeenCalled();
			expect(bumpProviderLibraryRevisionMock).not.toHaveBeenCalled();
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
				source: { source: "anilist", id: aid(100) },
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
