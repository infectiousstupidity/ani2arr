/** Tests for Sonarr add and update mutation workflows. */
// src/providers/library/sonarr-mutations.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	parseTvdbId,
} from "@/providers";
import { updateSonarrSeries } from "./sonarr-mutations";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};

describe("updateSonarrSeries", () => {
	it("merges the form, omits add options, moves files, applies monitoring, refreshes, and updates the cache", async () => {
		const seriesId = parseSonarrSeriesId(12);
		const tvdbId = parseTvdbId(34);
		const updatedSeries = {
			id: seriesId,
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/series-4k",
			path: "/series-4k/Example Series [tvdb-34]",
			monitored: false,
			seriesType: "anime" as const,
			seasonFolder: false,
			tags: [parseProviderTagId(7)],
		};
		const refreshedSeries = {
			...updatedSeries,
			monitored: true,
		};
		const existingSeries = {
			id: seriesId,
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/series",
			path: "/series/Example Series [tvdb-34]",
			monitored: true,
			seriesType: "standard" as const,
			seasonFolder: true,
			tags: [parseProviderTagId(1)],
			addOptions: {
				monitor: "all" as const,
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		};
		const client = {
			addSeries: vi.fn(),
			getSeriesByTvdbId: vi.fn(async () => existingSeries),
			getSeriesById: vi
				.fn()
				.mockResolvedValueOnce(existingSeries)
				.mockResolvedValueOnce(refreshedSeries),
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(),
			updateSeries: vi.fn(async () => updatedSeries),
			applyMonitoringAction: vi.fn(async () => {}),
		};
		const cache = {
			addSeriesToCache: vi.fn(async () => {}),
		};

		const result = await updateSonarrSeries(
			{
				tvdbId,
				title: "Example Series",
				form: {
					rootFolderPath: "/series-4k",
					qualityProfileId: parseProviderQualityProfileId(99),
					monitored: false,
					seriesType: "anime",
					seasonFolder: false,
					tags: [parseProviderTagId(7)],
					freeformTags: [],
				},
				monitoringAction: "all",
				credentials,
			},
			{ client, cache },
		);

		expect(result).toBe(refreshedSeries);
		expect(client.updateSeries).toHaveBeenCalledWith(
			seriesId,
			{
				id: seriesId,
				title: "Example Series",
				tvdbId,
				titleSlug: "example-series",
				qualityProfileId: parseProviderQualityProfileId(99),
				rootFolderPath: "/series-4k",
				path: "/series-4k/Example Series [tvdb-34]",
				monitored: false,
				seriesType: "anime",
				seasonFolder: false,
				tags: [parseProviderTagId(7)],
			},
			credentials,
			{ moveFiles: true },
		);
		expect(client.applyMonitoringAction).toHaveBeenCalledWith(
			seriesId,
			"all",
			credentials,
		);
		expect(client.getSeriesById).toHaveBeenCalledTimes(2);
		expect(cache.addSeriesToCache).toHaveBeenNthCalledWith(1, updatedSeries);
		expect(cache.addSeriesToCache).toHaveBeenNthCalledWith(2, refreshedSeries);
	});
});
