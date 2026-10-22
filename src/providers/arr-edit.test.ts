/** Focused full-payload and provider-specific Arr edit tests. */

import { describe, expect, it, vi } from "vitest";
import type { RadarrClient } from "./radarr/client";
import { updateRadarrMovie } from "./radarr/edit";
import type { RadarrMovie } from "./radarr/types";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
	SonarrSeriesId,
} from "./schemas";
import { parseTmdbId, parseTvdbId } from "./schemas";
import type { SonarrClient } from "./sonarr/client";
import { updateSonarrSeries } from "./sonarr/edit";
import type { SonarrSeries } from "./sonarr/types";

const credentials = {
	url: "https://arr.example.test",
	apiKey: "secret",
};

const qualityProfileId = 56 as ProviderQualityProfileId;
const updatedQualityProfileId = 99 as ProviderQualityProfileId;
const tagId = 7 as ProviderTagId;
const tvdbId = parseTvdbId(34);
const tmdbId = parseTmdbId(34);

function createSeries(overrides: Partial<SonarrSeries> = {}): SonarrSeries {
	return {
		id: 12 as SonarrSeriesId,
		title: "Example Series",
		tvdbId,
		titleSlug: "example-series",
		qualityProfileId,
		rootFolderPath: "/series",
		path: "/series/Example Series [tvdb-34]",
		monitored: true,
		monitorNewItems: "all",
		seriesType: "standard",
		seasonFolder: true,
		tags: [],
		...overrides,
	};
}

function createMovie(overrides: Partial<RadarrMovie> = {}): RadarrMovie {
	return {
		id: 12 as RadarrMovieId,
		title: "Example Movie",
		tmdbId,
		qualityProfileId,
		rootFolderPath: "/movies",
		path: "/movies/Example Movie [tmdb-34]",
		monitored: true,
		tags: [],
		...overrides,
	};
}

describe("Arr edit workflows", () => {
	it("updates the full Sonarr payload and applies the monitoring action", async () => {
		const existingSeries = createSeries({
			path: "/series/anime1",
			tags: [1 as ProviderTagId],
			statistics: { episodeCount: 12 },
		});
		const refreshedSeries = {
			...existingSeries,
			title: "Refreshed Series",
		};
		const client = {
			findSeriesByTvdbId: vi.fn(async () => existingSeries),
			getSeriesById: vi
				.fn()
				.mockResolvedValueOnce(existingSeries)
				.mockResolvedValueOnce(refreshedSeries),
			getSeriesFolderName: vi.fn(async () => ({
				folder: "Example Series [tvdb-34]",
			})),
			getTags: vi.fn(async () => [{ id: tagId, label: "Keep" }]),
			createTag: vi.fn(),
			updateSeries: vi.fn(async () => existingSeries),
			setSeriesMonitorMode: vi.fn(async () => {}),
		};

		await expect(
			updateSonarrSeries(
				{
					tvdbId,
					title: "Example Series",
					form: {
						rootFolderPath: "/series-4k",
						qualityProfileId: updatedQualityProfileId,
						monitored: false,
						monitorNewItems: "none",
						seriesType: "anime",
						seasonFolder: false,
						tags: [tagId],
						freeformTags: [],
					},
					monitoringAction: "all",
					credentials,
				},
				{ client: client as unknown as SonarrClient },
			),
		).resolves.toBe(refreshedSeries);

		expect(client.updateSeries).toHaveBeenCalledWith(
			existingSeries.id,
			expect.objectContaining({
				qualityProfileId: updatedQualityProfileId,
				rootFolderPath: "/series-4k",
				path: "/series-4k/Example Series [tvdb-34]",
				monitored: false,
				monitorNewItems: "none",
				seriesType: "anime",
				seasonFolder: false,
				tags: [tagId],
				statistics: { episodeCount: 12 },
			}),
			credentials,
			{ moveFiles: true },
		);
		expect(client.setSeriesMonitorMode).toHaveBeenCalledWith(
			existingSeries.id,
			"all",
			credentials,
		);
	});

	it("reports Sonarr partial success when monitoring fails after update", async () => {
		const existingSeries = createSeries();
		const client = {
			findSeriesByTvdbId: vi.fn(async () => existingSeries),
			getSeriesById: vi.fn(async () => existingSeries),
			getSeriesFolderName: vi.fn(),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
			updateSeries: vi.fn(async () => existingSeries),
			setSeriesMonitorMode: vi.fn(async () => {
				throw new Error("Season pass failed");
			}),
		};

		await expect(
			updateSonarrSeries(
				{
					tvdbId,
					title: "Example Series",
					form: {
						rootFolderPath: "/series",
						qualityProfileId,
						tags: [],
						freeformTags: [],
					},
					monitoringAction: "all",
					credentials,
				},
				{ client: client as unknown as SonarrClient },
			),
		).rejects.toMatchObject({
			details: {
				partialSuccess: true,
				step: "monitoringAction",
				seriesId: existingSeries.id,
			},
		});

		expect(client.updateSeries).toHaveBeenCalledOnce();
		expect(client.getSeriesFolderName).not.toHaveBeenCalled();
	});

	it("preserves a nested Radarr relative folder when changing roots", async () => {
		const shallowMovie = createMovie({
			path: "/movies/Old Folder",
		});
		const fullMovie = {
			...shallowMovie,
			titleSlug: "example-movie",
			path: "/movies/Anime/Example Movie",
			minimumAvailability: "announced" as const,
		};
		const updatedMovie = {
			...fullMovie,
			rootFolderPath: "/movies-4k",
			path: "/movies-4k/Anime/Example Movie",
		};
		const client = {
			findMovieByTmdbId: vi.fn(async () => shallowMovie),
			getMovieById: vi.fn(async () => fullMovie),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
			updateMovie: vi.fn(async () => updatedMovie),
		};

		await expect(
			updateRadarrMovie(
				{
					tmdbId,
					form: {
						rootFolderPath: "/movies-4k",
						freeformTags: [],
					},
					credentials,
				},
				{ client: client as unknown as RadarrClient },
			),
		).resolves.toBe(updatedMovie);

		expect(client.updateMovie).toHaveBeenCalledWith(
			fullMovie.id,
			{
				...fullMovie,
				rootFolderPath: "/movies-4k",
				path: "/movies-4k/Anime/Example Movie",
				tags: [],
			},
			credentials,
			{ moveFiles: true },
		);
	});
});
