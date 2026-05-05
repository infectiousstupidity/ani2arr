/** Tests for Sonarr add workflow payload building and save-time tag resolution. */
// src/providers/sonarr/add.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	parseTvdbId,
} from "@/providers";
import { addSonarrSeries } from "./add";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};

describe("addSonarrSeries", () => {
	it("builds the Sonarr add payload, resolves tags on save, and returns the created series", async () => {
		const tvdbId = parseTvdbId(34);
		const createdSeries = {
			id: parseSonarrSeriesId(12),
			title: "Example Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/series",
			path: "/series/Example Series [tvdb-34]",
			monitored: true,
			monitorNewItems: "all" as const,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [parseProviderTagId(7), parseProviderTagId(8)],
		};
		const client = {
			addSeries: vi.fn(async () => createdSeries),
			getTags: vi.fn(async () => [{ id: parseProviderTagId(7), label: "Keep" }]),
			createTag: vi.fn(async () => ({ id: parseProviderTagId(8), label: "new-tag" })),
		};

		const result = await addSonarrSeries(
			{
				tvdbId,
				title: "Example Series",
				form: {
					rootFolderPath: "/series",
					qualityProfileId: parseProviderQualityProfileId(99),
					seriesType: "anime",
					seasonFolder: true,
					tags: [parseProviderTagId(7)],
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
			{ client },
		);

		expect(result).toBe(createdSeries);
		expect(client.createTag).toHaveBeenCalledWith(credentials, "new-tag");
		expect(client.addSeries).toHaveBeenCalledWith(
			{
				title: "Example Series",
				tvdbId,
				qualityProfileId: parseProviderQualityProfileId(99),
				rootFolderPath: "/series",
				seasonFolder: true,
				monitored: true,
				seriesType: "anime",
				tags: [parseProviderTagId(7), parseProviderTagId(8)],
				addOptions: {
					monitor: "all",
					searchForMissingEpisodes: true,
					searchForCutoffUnmetEpisodes: false,
				},
			},
			credentials,
		);
	});

	it("does not add the series when tag creation fails", async () => {
		const client = {
			addSeries: vi.fn(),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(async () => {
				throw new Error("Tag create failed");
			}),
		};

		await expect(
			addSonarrSeries(
				{
					tvdbId: parseTvdbId(34),
					title: "Example Series",
					form: {
						rootFolderPath: "/series",
						qualityProfileId: parseProviderQualityProfileId(99),
						seriesType: "anime",
						seasonFolder: true,
						tags: [],
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
				{ client },
			),
		).rejects.toThrow("Tag create failed");
		expect(client.addSeries).not.toHaveBeenCalled();
	});

	it("does not resolve or create tags when required add fields are missing", async () => {
		const client = {
			addSeries: vi.fn(),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
		};

		await expect(
			addSonarrSeries(
				{
					tvdbId: parseTvdbId(34),
					title: "Example Series",
					form: {
						rootFolderPath: "/series",
						qualityProfileId: parseProviderQualityProfileId(99),
						seriesType: "anime",
						seasonFolder: true,
						tags: [],
						freeformTags: ["New Tag"],
						addOptions: {
							searchForMissingEpisodes: true,
							searchForCutoffUnmetEpisodes: false,
						},
					},
					defaults: { freeformTags: [] },
					credentials,
				},
				{ client },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addSeries).not.toHaveBeenCalled();
	});
});
