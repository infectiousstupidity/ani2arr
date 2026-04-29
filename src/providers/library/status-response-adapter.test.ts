import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist";
import {
	parseSonarrSeriesId,
	parseTmdbId,
	parseTvdbId,
} from "@/providers";
import {
	buildMovieStatusResponseFromLibraryStatus,
	buildSeriesStatusResponseFromLibraryStatus,
} from "./status-response-adapter";

describe("status response adapter", () => {
	it("builds mapped status from mapping fields and library status", () => {
		const seriesStatus = buildSeriesStatusResponseFromLibraryStatus({
			providerId: parseTvdbId(22),
			mappingSource: "manual",
			mappingReason: "manual-override",
			libraryStatus: {
				anilistId: parseAniListId(1),
				provider: "sonarr",
				providerId: parseTvdbId(22),
				isInLibrary: true,
				series: {
					id: parseSonarrSeriesId(11),
					tvdbId: parseTvdbId(22),
					title: "Mapped Series",
					titleSlug: "mapped-series",
				},
			},
		});
		const movieStatus = buildMovieStatusResponseFromLibraryStatus({
			providerId: parseTmdbId(44),
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			libraryStatus: {
				anilistId: parseAniListId(2),
				provider: "radarr",
				providerId: parseTmdbId(44),
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			},
		});

		expect(seriesStatus).toEqual({
			providerId: parseTvdbId(22),
			providerMappingState: "mapped",
			isInLibrary: true,
			mappingSource: "manual",
			mappingReason: "manual-override",
			series: {
				id: parseSonarrSeriesId(11),
				tvdbId: parseTvdbId(22),
				title: "Mapped Series",
				titleSlug: "mapped-series",
			},
		});
		expect(seriesStatus).not.toHaveProperty("successfulSynonym");
		expect(seriesStatus).not.toHaveProperty("resolverOutcome");
		expect(seriesStatus).not.toHaveProperty("mappingUnknownReason");
		expect(seriesStatus).not.toHaveProperty("linkedAniListIds");

		expect(movieStatus).toEqual({
			providerId: parseTmdbId(44),
			providerMappingState: "mapped",
			isInLibrary: null,
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			libraryUnknownReason: "library-check-failed",
		});
		expect(movieStatus).not.toHaveProperty("successfulSynonym");
		expect(movieStatus).not.toHaveProperty("resolverOutcome");
		expect(movieStatus).not.toHaveProperty("mappingUnknownReason");
		expect(movieStatus).not.toHaveProperty("linkedAniListIds");
	});
});
