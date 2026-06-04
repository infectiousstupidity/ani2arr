/** Tests for Radarr media modal setup value helpers. */
// src/features/media-modal/radarr/radarr-setup-values.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTmdbId } from "@/providers/schemas";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
} from "@/providers/schemas";
import type { GetMovieStatusOutput } from "@/rpc/types";
import {
	getRadarrAddDefaults,
	getRadarrEditDefaults,
	getRadarrSetupTarget,
	hasFullRadarrEditItem,
	isRadarrSetupDraftDirty,
} from "./radarr-setup-values";

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseRadarrMovieId = (value: number) => value as RadarrMovieId;

describe("radarr setup values", () => {
	it("hydrates edit defaults from movie-level fields only", () => {
		const defaults = getRadarrEditDefaults({
			id: parseRadarrMovieId(11),
			title: "Example Movie",
			tmdbId: parseTmdbId(22),
			path: "/media/movies/Example Movie",
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/movies",
			monitored: true,
			minimumAvailability: "released",
			tags: [parseProviderTagId(44)],
		});

		expect(defaults).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/movies",
			monitored: true,
			minimumAvailability: "released",
			tags: [parseProviderTagId(44)],
			freeformTags: [],
		});
		expect(defaults.addOptions).toBeUndefined();
	});

	it("hydrates add defaults from persisted defaults", () => {
		const defaults = getRadarrAddDefaults({
			rootFolderPath: "/defaults",
			qualityProfileId: parseProviderQualityProfileId(44),
			minimumAvailability: "announced",
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		});

		expect(defaults).toMatchObject({
			rootFolderPath: "/defaults",
			qualityProfileId: parseProviderQualityProfileId(44),
			minimumAvailability: "announced",
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		});
	});

	it("derives dirty from current values instead of touched state", () => {
		const baseline = getRadarrEditDefaults({
			id: parseRadarrMovieId(11),
			title: "Example Movie",
			tmdbId: parseTmdbId(22),
			path: "/media/movies/Example Movie",
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/movies",
			monitored: true,
			minimumAvailability: "released",
			tags: [],
		});
		const changed = {
			...baseline,
			qualityProfileId: parseProviderQualityProfileId(66),
		};
		const reverted = {
			...changed,
			qualityProfileId: baseline.qualityProfileId,
		};

		expect(
			isRadarrSetupDraftDirty({
				baselineValues: baseline,
				values: changed,
			}),
		).toBe(true);
		expect(
			isRadarrSetupDraftDirty({
				baselineValues: baseline,
				values: reverted,
			}),
		).toBe(false);
	});

	it("does not create an edit target from a lean in-library item", () => {
		const status: GetMovieStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTmdbId(22) },
			isInLibrary: true,
			movie: {
				id: parseRadarrMovieId(11),
				tmdbId: parseTmdbId(22),
				title: "Lean Movie",
			},
		};

		expect(hasFullRadarrEditItem(status)).toBe(false);
		expect(
			getRadarrSetupTarget({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toBeNull();
	});

	it("creates an edit target from a full in-library item", () => {
		const status: GetMovieStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTmdbId(22) },
			isInLibrary: true,
			movie: {
				id: parseRadarrMovieId(11),
				tmdbId: parseTmdbId(22),
				title: "Editable Movie",
				qualityProfileId: parseProviderQualityProfileId(33),
				rootFolderPath: "/media/movies",
				monitored: true,
				tags: [],
			},
		};

		expect(
			getRadarrSetupTarget({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toMatchObject({
			mode: "edit",
			key: "radarr:edit:1:11",
			tmdbId: parseTmdbId(22),
			title: "Editable Movie",
		});
	});

	it("creates an add target from mapped not-in-library status", () => {
		const status: GetMovieStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTmdbId(22) },
			isInLibrary: false,
		};

		expect(
			getRadarrSetupTarget({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Add Movie",
				storedDefaults: {
					rootFolderPath: "/defaults",
					qualityProfileId: parseProviderQualityProfileId(44),
				},
			}),
		).toMatchObject({
			mode: "add",
			key: "radarr:add:1:22",
			tmdbId: parseTmdbId(22),
			title: "Add Movie",
			initialFormValues: {
				rootFolderPath: "/defaults",
				qualityProfileId: parseProviderQualityProfileId(44),
			},
		});
	});
});
