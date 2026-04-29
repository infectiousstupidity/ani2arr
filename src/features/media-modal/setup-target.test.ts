import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist";
import {
	parseProviderQualityProfileId,
	parseRadarrMovieId,
	parseSonarrSeriesId,
	parseTmdbId,
	parseTvdbId,
} from "@/providers";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "@/rpc/types";
import {
	createRadarrSetupTargetCandidate,
	createSonarrSetupTargetCandidate,
	getRadarrSetupTargetCandidateStatus,
	getSonarrSetupTargetCandidateStatus,
	hasFullRadarrEditItem,
	hasFullSonarrEditItem,
} from "./setup-target";

describe("setup target", () => {
	it("does not create a Sonarr edit target from a lean in-library item", () => {
		const status: CheckSeriesStatusResponse = {
			providerId: parseTvdbId(22),
			providerMappingState: "mapped",
			isInLibrary: true,
			series: {
				id: parseSonarrSeriesId(11),
				tvdbId: parseTvdbId(22),
				title: "Lean Series",
				titleSlug: "lean-series",
			},
		};

		expect(hasFullSonarrEditItem(status)).toBe(false);
		expect(
			createSonarrSetupTargetCandidate({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toBeNull();
	});

	it("creates a Sonarr edit target from a full in-library item", () => {
		const status: CheckSeriesStatusResponse = {
			providerId: parseTvdbId(22),
			providerMappingState: "mapped",
			isInLibrary: true,
			series: {
				id: parseSonarrSeriesId(11),
				tvdbId: parseTvdbId(22),
				title: "Full Series",
				titleSlug: "full-series",
				rootFolderPath: "/series",
				qualityProfileId: parseProviderQualityProfileId(33),
				monitored: true,
				seriesType: "anime",
				seasonFolder: true,
			},
		};

		const target = createSonarrSetupTargetCandidate({
			anilistId: parseAniListId(1),
			status,
			targetTitle: "Fallback",
			storedDefaults: {
				rootFolderPath: "/default",
				qualityProfileId: parseProviderQualityProfileId(44),
			},
		});

		expect(hasFullSonarrEditItem(status)).toBe(true);
		expect(target).toMatchObject({
			provider: "sonarr",
			setupMode: "edit",
			key: "sonarr:edit:1:11",
			tvdbId: parseTvdbId(22),
			seriesId: parseSonarrSeriesId(11),
			targetTitle: "Full Series",
			initialFormDraft: {
				rootFolderPath: "/series",
				qualityProfileId: parseProviderQualityProfileId(33),
			},
			initialMonitoringAction: "noChange",
		});
	});

	it("creates add targets from mapped provider IDs and keeps keys independent from defaults", () => {
		const status: CheckSeriesStatusResponse = {
			providerId: parseTvdbId(22),
			providerMappingState: "mapped",
			isInLibrary: false,
		};

		const first = createSonarrSetupTargetCandidate({
			anilistId: parseAniListId(1),
			status,
			targetTitle: "Add Series",
			storedDefaults: {
				rootFolderPath: "/one",
				qualityProfileId: parseProviderQualityProfileId(33),
			},
		});
		const second = createSonarrSetupTargetCandidate({
			anilistId: parseAniListId(1),
			status,
			targetTitle: "Add Series",
			storedDefaults: {
				rootFolderPath: "/two",
				qualityProfileId: parseProviderQualityProfileId(44),
			},
		});

		expect(first).toMatchObject({
			provider: "sonarr",
			setupMode: "add",
			key: "sonarr:add:1:22",
			tvdbId: parseTvdbId(22),
		});
		expect(second?.key).toBe(first?.key);
		expect(second?.initialFormDraft.rootFolderPath).toBe("/two");
	});

	it("keeps Sonarr full status only when the mapping target did not change", () => {
		const status: CheckSeriesStatusResponse = {
			providerId: parseTvdbId(22),
			providerMappingState: "mapped",
			isInLibrary: true,
			series: {
				id: parseSonarrSeriesId(11),
				tvdbId: parseTvdbId(22),
				title: "Full Series",
				titleSlug: "full-series",
				rootFolderPath: "/series",
				qualityProfileId: parseProviderQualityProfileId(33),
				monitored: true,
				seriesType: "anime",
				seasonFolder: true,
			},
		};

		expect(
			getSonarrSetupTargetCandidateStatus({
				status,
				tvdbId: parseTvdbId(22),
			}),
		).toBe(status);
		expect(
			getSonarrSetupTargetCandidateStatus({
				status,
				tvdbId: parseTvdbId(23),
			}),
		).toMatchObject({
			providerId: parseTvdbId(23),
			providerMappingState: "mapped",
			isInLibrary: false,
		});
	});

	it("does not create a Radarr edit target from a lean in-library item", () => {
		const status: CheckMovieStatusResponse = {
			providerId: parseTmdbId(900),
			providerMappingState: "mapped",
			isInLibrary: true,
			movie: {
				id: parseRadarrMovieId(12),
				tmdbId: parseTmdbId(900),
				title: "Lean Movie",
			},
		};

		expect(hasFullRadarrEditItem(status)).toBe(false);
		expect(
			createRadarrSetupTargetCandidate({
				anilistId: parseAniListId(2),
				status,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toBeNull();
	});

	it("creates Radarr edit and add targets with identity-only keys", () => {
		const editStatus: CheckMovieStatusResponse = {
			providerId: parseTmdbId(900),
			providerMappingState: "mapped",
			isInLibrary: true,
			movie: {
				id: parseRadarrMovieId(12),
				tmdbId: parseTmdbId(900),
				title: "Full Movie",
				rootFolderPath: "/movies",
				qualityProfileId: parseProviderQualityProfileId(33),
				monitored: true,
			},
		};
		const addStatus: CheckMovieStatusResponse = {
			providerId: parseTmdbId(901),
			providerMappingState: "mapped",
			isInLibrary: false,
		};

		expect(
			createRadarrSetupTargetCandidate({
				anilistId: parseAniListId(2),
				status: editStatus,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toMatchObject({
			provider: "radarr",
			setupMode: "edit",
			key: "radarr:edit:2:12",
			tmdbId: parseTmdbId(900),
			movieId: parseRadarrMovieId(12),
			initialFormDraft: {
				rootFolderPath: "/movies",
				qualityProfileId: parseProviderQualityProfileId(33),
			},
		});

		expect(
			createRadarrSetupTargetCandidate({
				anilistId: parseAniListId(2),
				status: addStatus,
				targetTitle: "Add Movie",
				storedDefaults: {
					rootFolderPath: "/defaults",
					qualityProfileId: parseProviderQualityProfileId(44),
				},
			}),
		).toMatchObject({
			provider: "radarr",
			setupMode: "add",
			key: "radarr:add:2:901",
			tmdbId: parseTmdbId(901),
			initialFormDraft: {
				rootFolderPath: "/defaults",
				qualityProfileId: parseProviderQualityProfileId(44),
			},
		});
	});

	it("keeps Radarr full status only when the mapping target did not change", () => {
		const status: CheckMovieStatusResponse = {
			providerId: parseTmdbId(900),
			providerMappingState: "mapped",
			isInLibrary: true,
			movie: {
				id: parseRadarrMovieId(12),
				tmdbId: parseTmdbId(900),
				title: "Full Movie",
				rootFolderPath: "/movies",
				qualityProfileId: parseProviderQualityProfileId(33),
				monitored: true,
			},
		};

		expect(
			getRadarrSetupTargetCandidateStatus({
				status,
				tmdbId: parseTmdbId(900),
			}),
		).toBe(status);
		expect(
			getRadarrSetupTargetCandidateStatus({
				status,
				tmdbId: parseTmdbId(901),
			}),
		).toMatchObject({
			providerId: parseTmdbId(901),
			providerMappingState: "mapped",
			isInLibrary: false,
		});
	});
});
