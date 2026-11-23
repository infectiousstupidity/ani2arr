import { describe, expect, it } from "vitest";
import { parseTmdbId } from "@/providers/schemas";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
} from "@/providers/schemas";
import type { RadarrMovie } from "@/providers/radarr/types";
import type { GetMovieStatusOutput } from "@/rpc/types";
import {
	getRadarrEditDefaults,
	getRadarrSetupTarget,
	isRadarrSetupDraftDirty,
} from "./radarr-setup-values";

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseRadarrMovieId = (value: number) => value as RadarrMovieId;

const movie = {
	id: parseRadarrMovieId(11),
	title: "Editable Movie",
	tmdbId: parseTmdbId(22),
	path: "/media/movies/Editable Movie",
	qualityProfileId: parseProviderQualityProfileId(33),
	rootFolderPath: "/media/movies",
	monitored: true,
	minimumAvailability: "released",
	tags: [parseProviderTagId(44)],
} satisfies RadarrMovie;

describe("radarr setup values", () => {
	it("derives dirty from current values instead of touched state", () => {
		const baseline = getRadarrEditDefaults(movie);
		const isDirty = (values: typeof baseline) =>
			isRadarrSetupDraftDirty({ baselineValues: baseline, values });
		const changed = {
			...baseline,
			qualityProfileId: parseProviderQualityProfileId(66),
		};
		const reverted = {
			...changed,
			qualityProfileId: baseline.qualityProfileId,
		};

		expect(isDirty(changed)).toBe(true);
		expect(isDirty(reverted)).toBe(false);
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

		expect(
			getRadarrSetupTarget({
				identityKey: "anilist:1",
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
			movie,
		};

		const target = getRadarrSetupTarget({
			identityKey: "anilist:1",
			status,
			targetTitle: "Fallback",
			storedDefaults: {},
		});

		expect(target).toMatchObject({
			mode: "edit",
			key: "radarr:edit:anilist:1:11",
			tmdbId: parseTmdbId(22),
			title: "Editable Movie",
			initialFormValues: {
				qualityProfileId: parseProviderQualityProfileId(33),
				rootFolderPath: "/media/movies",
				monitored: true,
				minimumAvailability: "released",
				tags: [parseProviderTagId(44)],
				freeformTags: [],
			},
		});
		expect(target?.initialFormValues.addOptions).toBeUndefined();
	});

	it("creates an add target from mapped not-in-library status", () => {
		const status: GetMovieStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTmdbId(22) },
			isInLibrary: false,
		};

		expect(
			getRadarrSetupTarget({
				identityKey: "anilist:1",
				status,
				targetTitle: "Add Movie",
				storedDefaults: {
					rootFolderPath: "/defaults",
					qualityProfileId: parseProviderQualityProfileId(44),
				},
			}),
		).toMatchObject({
			mode: "add",
			key: "radarr:add:anilist:1:22",
			tmdbId: parseTmdbId(22),
			title: "Add Movie",
			initialFormValues: {
				rootFolderPath: "/defaults",
				qualityProfileId: parseProviderQualityProfileId(44),
				minimumAvailability: "released",
			},
		});
	});
});
