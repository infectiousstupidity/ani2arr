/** Focused payload and catalog-validation tests for Arr add workflows. */

import { describe, expect, it, vi } from "vitest";
import { addRadarrMovie } from "./radarr/add";
import type { RadarrClient } from "./radarr/client";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
	SonarrSeriesId,
} from "./schemas";
import { parseTmdbId, parseTvdbId } from "./schemas";
import { addSonarrSeries } from "./sonarr/add";
import type { SonarrClient } from "./sonarr/client";

const credentials = {
	url: "https://arr.example.test",
	apiKey: "secret",
};

const qualityProfileId = 99 as ProviderQualityProfileId;
const existingTagId = 7 as ProviderTagId;
const createdTagId = 8 as ProviderTagId;
const tvdbId = parseTvdbId(34);
const tmdbId = parseTmdbId(34);

describe("Arr add workflows", () => {
	it("builds the Sonarr add payload and resolves tags at save time", async () => {
		const lookupSeries = {
			title: "Lookup Series",
			tvdbId,
			titleSlug: "lookup-series",
			folder: "Lookup Series [tvdb-34]",
		};
		const createdSeries = {
			id: 12 as SonarrSeriesId,
			...lookupSeries,
			qualityProfileId,
			rootFolderPath: "/series",
			path: "/series/Lookup Series [tvdb-34]",
			monitored: true,
			monitorNewItems: "all" as const,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [existingTagId, createdTagId],
		};
		const client = {
			lookupSeriesByTvdbId: vi.fn(async () => lookupSeries),
			getTags: vi.fn(async () => [{ id: existingTagId, label: "Keep" }]),
			createTag: vi.fn(async () => ({
				id: createdTagId,
				label: "new-tag",
			})),
			addSeries: vi.fn(async () => createdSeries),
		};

		await expect(
			addSonarrSeries(
				{
					tvdbId,
					title: "Example Series",
					form: {
						rootFolderPath: "/series",
						qualityProfileId,
						seriesType: "anime",
						seasonFolder: true,
						tags: [existingTagId],
						freeformTags: ["New Tag"],
						addOptions: {
							monitor: "all",
							searchForMissingEpisodes: true,
							searchForCutoffUnmetEpisodes: false,
						},
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{ client: client as unknown as SonarrClient },
			),
		).resolves.toBe(createdSeries);

		expect(client.createTag).toHaveBeenCalledWith("new-tag", credentials);
		expect(client.addSeries).toHaveBeenCalledWith(
			expect.objectContaining({
				tvdbId,
				qualityProfileId,
				rootFolderPath: "/series",
				seriesType: "anime",
				seasonFolder: true,
				monitored: true,
				tags: [existingTagId, createdTagId],
				addOptions: {
					monitor: "all",
					searchForMissingEpisodes: true,
					searchForCutoffUnmetEpisodes: false,
				},
			}),
			credentials,
		);
	});

	it("builds a Radarr add payload without mutating lookup data", async () => {
		const lookupMovie = {
			id: 1 as RadarrMovieId,
			title: "Lookup Movie",
			tmdbId,
			imdbId: "tt0034",
			year: 2025,
			alternateTitles: [{ title: "Preserved Title" }],
		};
		const originalLookupMovie = structuredClone(lookupMovie);
		const createdMovie = {
			...lookupMovie,
			id: 12 as RadarrMovieId,
			qualityProfileId,
			rootFolderPath: "/movies",
			path: "/movies/Lookup Movie [tmdb-34]",
			monitored: false,
			minimumAvailability: "released" as const,
			tags: [existingTagId, createdTagId],
		};
		const client = {
			lookupMovieByTmdbId: vi.fn(async () => lookupMovie),
			getTags: vi.fn(async () => [{ id: existingTagId, label: "Keep" }]),
			createTag: vi.fn(async () => ({
				id: createdTagId,
				label: "new-tag",
			})),
			addMovie: vi.fn(async () => createdMovie),
		};

		await expect(
			addRadarrMovie(
				{
					tmdbId,
					form: {
						rootFolderPath: "/movies",
						qualityProfileId,
						minimumAvailability: "released",
						tags: [existingTagId],
						freeformTags: ["New Tag"],
						addOptions: {
							monitor: "none",
							searchForMovie: false,
						},
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{ client: client as unknown as RadarrClient },
			),
		).resolves.toBe(createdMovie);

		expect(lookupMovie).toEqual(originalLookupMovie);
		expect(client.addMovie).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 0,
				title: "Lookup Movie",
				tmdbId,
				imdbId: "tt0034",
				qualityProfileId,
				rootFolderPath: "/movies",
				monitored: false,
				minimumAvailability: "released",
				tags: [existingTagId, createdTagId],
				addOptions: {
					monitor: "none",
					searchForMovie: false,
				},
			}),
			credentials,
		);
	});

	it("stops before tags or add when the provider catalog misses", async () => {
		const sonarrClient = {
			lookupSeriesByTvdbId: vi.fn(async () => null),
			getTags: vi.fn(),
			createTag: vi.fn(),
			addSeries: vi.fn(),
		};
		const radarrClient = {
			lookupMovieByTmdbId: vi.fn(async () => null),
			getTags: vi.fn(),
			createTag: vi.fn(),
			addMovie: vi.fn(),
		};

		await expect(
			addSonarrSeries(
				{
					tvdbId,
					title: "Missing Series",
					form: {
						rootFolderPath: "/series",
						qualityProfileId,
						seriesType: "anime",
						seasonFolder: true,
						freeformTags: [],
						addOptions: {
							monitor: "all",
							searchForMissingEpisodes: true,
							searchForCutoffUnmetEpisodes: false,
						},
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{
					client: sonarrClient as unknown as SonarrClient,
				},
			),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

		await expect(
			addRadarrMovie(
				{
					tmdbId,
					form: {
						rootFolderPath: "/movies",
						qualityProfileId,
						minimumAvailability: "released",
						freeformTags: [],
						addOptions: {
							monitor: "movieOnly",
							searchForMovie: true,
						},
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{
					client: radarrClient as unknown as RadarrClient,
				},
			),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

		expect(sonarrClient.getTags).not.toHaveBeenCalled();
		expect(sonarrClient.addSeries).not.toHaveBeenCalled();
		expect(radarrClient.getTags).not.toHaveBeenCalled();
		expect(radarrClient.addMovie).not.toHaveBeenCalled();
	});
});
