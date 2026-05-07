/** Tests for media-modal provider draft builders. */
// src/features/media-modal/provider-drafts.test.ts

import { describe, expect, it } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseSonarrSeriesId,
	parseTmdbId,
	parseTvdbId,
} from "@/providers";
import { buildRadarrEditDraft, buildSonarrEditDraft } from "./provider-drafts";

describe("provider drafts", () => {
	it("hydrates Sonarr edit drafts from series-level fields only", () => {
		const draft = buildSonarrEditDraft({
			id: parseSonarrSeriesId(11),
			title: "Example Series",
			tvdbId: parseTvdbId(22),
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			path: "/media/series/Example Series",
			monitored: true,
			monitorNewItems: "none",
			seriesType: "anime",
			seasonFolder: true,
			tags: [parseProviderTagId(44)],
		});

		expect(draft.form).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			monitored: true,
			monitorNewItems: "none",
			seriesType: "anime",
			seasonFolder: true,
			tags: [parseProviderTagId(44)],
			freeformTags: [],
		});
		expect(draft.form.addOptions).toBeUndefined();
		expect(draft.monitoringAction).toBe("noChange");
	});

	it("hydrates Radarr edit drafts from movie-level fields only", () => {
		const draft = buildRadarrEditDraft({
			id: parseRadarrMovieId(12),
			title: "Example Movie",
			tmdbId: parseTmdbId(34),
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/movies",
			path: "/media/movies/Example Movie",
			monitored: false,
			minimumAvailability: "released",
			tags: [parseProviderTagId(44)],
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		});

		expect(draft).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/movies",
			monitored: false,
			minimumAvailability: "released",
			tags: [parseProviderTagId(44)],
			freeformTags: [],
		});
		expect(draft.addOptions).toBeUndefined();
	});
});
