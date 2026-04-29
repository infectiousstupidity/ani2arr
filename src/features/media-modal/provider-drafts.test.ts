import { describe, expect, it } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	parseTvdbId,
} from "@/providers";
import { buildSonarrEditDraft } from "./provider-drafts";

describe("provider drafts", () => {
	it("hydrates Sonarr edit drafts from series-level fields only", () => {
		const draft = buildSonarrEditDraft({
			id: parseSonarrSeriesId(11),
			title: "Example Series",
			tvdbId: parseTvdbId(22),
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			monitored: true,
			seriesType: "anime",
			seasonFolder: true,
			tags: [parseProviderTagId(44)],
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: true,
			},
		});

		expect(draft.form).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			monitored: true,
			seriesType: "anime",
			seasonFolder: true,
			tags: [parseProviderTagId(44)],
			freeformTags: [],
		});
		expect(draft.form.addOptions).toBeUndefined();
		expect(draft.monitoringAction).toBe("noChange");
	});
});
