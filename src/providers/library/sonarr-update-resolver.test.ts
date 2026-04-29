import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseSonarrSeriesId,
	parseTvdbId,
} from "@/providers";
import { resolveSonarrSeriesUpdate } from "./sonarr-update-resolver";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};

describe("resolveSonarrSeriesUpdate", () => {
	it("uses the series-level monitored flag and does not send addOptions", async () => {
		const baseSeries = {
			id: parseSonarrSeriesId(12),
			title: "Example Series",
			tvdbId: parseTvdbId(34),
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(56),
			rootFolderPath: "/media/series",
			path: "/media/series/Example Series [tvdb-34]",
			monitored: true,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [],
			addOptions: {
				monitor: "all" as const,
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		};

		const api = {
			getSeriesByTvdbId: vi.fn(async () => baseSeries),
			getSeriesById: vi.fn(async () => baseSeries),
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
		};

		const resolved = await resolveSonarrSeriesUpdate({
			api,
			credentials,
			form: {
				rootFolderPath: "/media/series",
				qualityProfileId: parseProviderQualityProfileId(56),
				monitored: false,
				seriesType: "anime",
				seasonFolder: true,
				tags: [],
				freeformTags: [],
			},
			title: "Example Series",
			tvdbId: parseTvdbId(34),
		});

		expect(resolved.seriesId).toBe(parseSonarrSeriesId(12));
		expect(resolved.moveFiles).toBe(false);
		expect(resolved.payload.monitored).toBe(false);
		expect("addOptions" in resolved.payload).toBe(false);
	});
});
