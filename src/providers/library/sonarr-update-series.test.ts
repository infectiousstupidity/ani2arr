import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseSonarrSeriesId,
	parseTvdbId,
} from "@/providers";
import { updateSonarrSeries } from "./sonarr-update-series";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};

describe("updateSonarrSeries", () => {
	it("skips the monitoring action API when the edit action is noChange", async () => {
		const seriesId = parseSonarrSeriesId(12);
		const tvdbId = parseTvdbId(34);
		const updatedSeries = {
			id: seriesId,
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/media/series",
			path: "/media/series/Example Series [tvdb-34]",
			monitored: true,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [],
		};

		const client = {
			getSeriesByTvdbId: vi.fn(async () => updatedSeries),
			getSeriesById: vi.fn(async () => updatedSeries),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
			updateSeries: vi.fn(async () => updatedSeries),
			applyMonitoringAction: vi.fn(async () => {}),
		};
		const library = {
			addSeriesToCache: vi.fn(async () => {}),
		};

		const result = await updateSonarrSeries(
			{
				tvdbId,
				title: "Example Series",
				form: {
					rootFolderPath: "/media/series",
					qualityProfileId: parseProviderQualityProfileId(56),
					monitored: true,
					seriesType: "anime",
					seasonFolder: true,
					tags: [],
					freeformTags: [],
				},
				monitoringAction: "noChange",
				credentials,
			},
			{ client, library },
		);

		expect(result).toBe(updatedSeries);
		expect(client.applyMonitoringAction).not.toHaveBeenCalled();
		expect(client.getSeriesById).toHaveBeenCalledTimes(1);
		expect(library.addSeriesToCache).toHaveBeenCalledTimes(1);
	});

	it("applies the monitoring action and refreshes the series afterward", async () => {
		const seriesId = parseSonarrSeriesId(12);
		const tvdbId = parseTvdbId(34);
		const baseSeries = {
			id: seriesId,
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/media/series",
			path: "/media/series/Example Series [tvdb-34]",
			monitored: true,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [],
		};
		const refreshedSeries = {
			...baseSeries,
			monitored: false,
		};

		const client = {
			getSeriesByTvdbId: vi.fn(async () => baseSeries),
			getSeriesById: vi
				.fn()
				.mockResolvedValueOnce(baseSeries)
				.mockResolvedValueOnce(refreshedSeries),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
			updateSeries: vi.fn(async () => baseSeries),
			applyMonitoringAction: vi.fn(async () => {}),
		};
		const library = {
			addSeriesToCache: vi.fn(async () => {}),
		};

		const result = await updateSonarrSeries(
			{
				tvdbId,
				title: "Example Series",
				form: {
					rootFolderPath: "/media/series",
					qualityProfileId: parseProviderQualityProfileId(56),
					monitored: true,
					seriesType: "anime",
					seasonFolder: true,
					tags: [],
					freeformTags: [],
				},
				monitoringAction: "none",
				credentials,
			},
			{ client, library },
		);

		expect(client.applyMonitoringAction).toHaveBeenCalledWith(
			seriesId,
			"none",
			credentials,
		);
		expect(client.getSeriesById).toHaveBeenCalledTimes(2);
		expect(library.addSeriesToCache).toHaveBeenCalledTimes(2);
		expect(result).toBe(refreshedSeries);
	});
});
