/** Tests for Sonarr edit workflow full-payload updates and monitoring actions. */
// src/providers/sonarr/edit.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	parseTvdbId,
} from "@/providers";
import { updateSonarrSeries } from "./edit";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};

describe("updateSonarrSeries", () => {
	it("sends a merged full series payload, applies monitoring, and returns the refreshed series", async () => {
		const seriesId = parseSonarrSeriesId(12);
		const tvdbId = parseTvdbId(34);
		const existingSeries = {
			id: seriesId,
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/series",
			path: "/series/anime1",
			monitored: true,
			monitorNewItems: "all" as const,
			seriesType: "standard" as const,
			seasonFolder: true,
			tags: [parseProviderTagId(1)],
			statistics: { episodeCount: 12 },
		};
		const updatedSeries = {
			...existingSeries,
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/series-4k",
			path: "/series-4k/Example Series [tvdb-34]",
			monitored: false,
			monitorNewItems: "none" as const,
			seriesType: "anime" as const,
			seasonFolder: false,
			tags: [parseProviderTagId(7)],
		};
		const refreshedSeries = {
			...updatedSeries,
			monitored: true,
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
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(),
			updateSeries: vi.fn(async () => updatedSeries),
			setSeriesMonitorMode: vi.fn(async () => {}),
		};

		const result = await updateSonarrSeries(
			{
				tvdbId,
				title: "Example Series",
				form: {
					rootFolderPath: "/series-4k",
					qualityProfileId: parseProviderQualityProfileId(99),
					monitored: false,
					monitorNewItems: "none",
					seriesType: "anime",
					seasonFolder: false,
					tags: [parseProviderTagId(7)],
					freeformTags: [],
				},
				monitoringAction: "all",
				credentials,
			},
			{ client },
		);

		expect(result).toBe(refreshedSeries);
		expect(client.updateSeries).toHaveBeenCalledWith(
			seriesId,
			{
				...existingSeries,
				qualityProfileId: parseProviderQualityProfileId(99),
				rootFolderPath: "/series-4k",
				path: "/series-4k/Example Series [tvdb-34]",
				monitored: false,
				monitorNewItems: "none",
				seriesType: "anime",
				seasonFolder: false,
				tags: [parseProviderTagId(7)],
			},
			credentials,
			{ moveFiles: true },
		);
		expect(client.setSeriesMonitorMode).toHaveBeenCalledWith(
			seriesId,
			"all",
			credentials,
		);
		expect(client.getSeriesFolderName).toHaveBeenCalledWith(
			seriesId,
			credentials,
		);
		expect(client.getSeriesById).toHaveBeenCalledTimes(2);
	});

	it("throws a partial-success error when monitoring action fails after update", async () => {
		const seriesId = parseSonarrSeriesId(12);
		const tvdbId = parseTvdbId(34);
		const existingSeries = {
			id: seriesId,
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/series",
			path: "/series/Example Series [tvdb-34]",
			monitored: true,
			monitorNewItems: "all" as const,
			seriesType: "standard" as const,
			seasonFolder: true,
			tags: [],
		};
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
						qualityProfileId: parseProviderQualityProfileId(56),
						tags: [],
						freeformTags: [],
					},
					monitoringAction: "all",
					credentials,
				},
				{ client },
			),
		).rejects.toMatchObject({
			details: {
				partialSuccess: true,
				step: "monitoringAction",
				seriesId,
			},
		});
		expect(client.updateSeries).toHaveBeenCalledOnce();
		expect(client.getSeriesFolderName).not.toHaveBeenCalled();
	});
});
