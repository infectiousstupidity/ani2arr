/** Tests for RPC input schemas at the extension messaging boundary. */
// src/rpc/schemas.test.ts

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/anilist-id";
import { parseTmdbId, parseTvdbId } from "@/providers";
import {
	AddRadarrInputSchema,
	AddSonarrInputSchema,
	ClearMappingRejectedCandidateInputSchema,
	SetManualMappingInputSchema,
	SetMappingRejectedCandidateInputSchema,
	UpdateRadarrInputSchema,
	UpdateSonarrInputSchema,
	ValidateTmdbInputSchema,
	ValidateTvdbInputSchema,
	type SetManualMappingInput,
} from "./schemas";

const INVALID_PROVIDER_IDS = [
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"123",
	null,
	undefined,
] as const;

describe("RPC provider ID schemas", () => {
	it("parses provider-discriminated manual mapping IDs", () => {
		const anilistId = parseAniListId(100);
		const tvdbId = parseTvdbId(200);
		const tmdbId = parseTmdbId(300);

		expect(
			v.parse(SetManualMappingInputSchema, {
				anilistId,
				provider: "sonarr",
				providerId: tvdbId,
			}),
		).toEqual({ anilistId, provider: "sonarr", providerId: tvdbId });

		expect(
			v.parse(SetManualMappingInputSchema, {
				anilistId,
				provider: "radarr",
				providerId: tmdbId,
				force: true,
			}),
		).toEqual({
			anilistId,
			provider: "radarr",
			providerId: tmdbId,
			force: true,
		});
	});

	it.each([
		SetManualMappingInputSchema,
		SetMappingRejectedCandidateInputSchema,
		ClearMappingRejectedCandidateInputSchema,
	])("rejects invalid provider mapping IDs", (schema) => {
		for (const providerId of INVALID_PROVIDER_IDS) {
			expect(() =>
				v.parse(schema, {
					anilistId: 100,
					provider: "sonarr",
					providerId,
				}),
			).toThrow();
		}
	});

	it("parses TVDB and TMDB IDs for add, update, and validation inputs", () => {
		const anilistId = parseAniListId(100);
		const tvdbId = parseTvdbId(200);
		const tmdbId = parseTmdbId(300);
		const form = {
			rootFolderPath: "/media",
			qualityProfileId: 1,
			tags: [],
		};

		expect(
			v.parse(AddSonarrInputSchema, {
				anilistId,
				tvdbId,
				title: "Series",
				form,
			}).tvdbId,
		).toBe(tvdbId);
		expect(
			v.parse(AddRadarrInputSchema, {
				anilistId,
				tmdbId,
				title: "Movie",
				form,
			}).tmdbId,
		).toBe(tmdbId);
		expect(
			v.parse(UpdateSonarrInputSchema, {
				anilistId,
				tvdbId,
				title: "Series",
				form,
				monitoringAction: "future",
			}).tvdbId,
		).toBe(tvdbId);
		expect(
			v.parse(UpdateSonarrInputSchema, {
				anilistId,
				tvdbId,
				title: "Series",
				form,
				monitoringAction: "future",
			}).monitoringAction,
		).toBe("future");
		expect(
			v.parse(UpdateRadarrInputSchema, {
				anilistId,
				tmdbId,
				title: "Movie",
				form,
			}).tmdbId,
		).toBe(tmdbId);
		expect(v.parse(ValidateTvdbInputSchema, { tvdbId }).tvdbId).toBe(tvdbId);
		expect(v.parse(ValidateTmdbInputSchema, { tmdbId }).tmdbId).toBe(tmdbId);
	});

	it("rejects invalid TVDB and TMDB add and validation IDs", () => {
		for (const value of INVALID_PROVIDER_IDS) {
			expect(() =>
				v.parse(AddSonarrInputSchema, {
					anilistId: 100,
					tvdbId: value,
					title: "Series",
					form: {
						rootFolderPath: "/media",
						qualityProfileId: 1,
						tags: [],
					},
				}),
			).toThrow();
			expect(() =>
				v.parse(AddRadarrInputSchema, {
					anilistId: 100,
					tmdbId: value,
					title: "Movie",
					form: {
						rootFolderPath: "/media",
						qualityProfileId: 1,
						tags: [],
					},
				}),
			).toThrow();
			expect(() =>
				v.parse(ValidateTvdbInputSchema, { tvdbId: value }),
			).toThrow();
			expect(() =>
				v.parse(ValidateTmdbInputSchema, { tmdbId: value }),
			).toThrow();
		}
	});

	it("rejects invalid Sonarr edit monitoring actions", () => {
		expect(() =>
			v.parse(UpdateSonarrInputSchema, {
				anilistId,
				tvdbId,
				title: "Series",
				form: {
					rootFolderPath: "/media",
					qualityProfileId: 1,
					tags: [],
				},
				monitoringAction: "wat",
			}),
		).toThrow();
	});
});

const anilistId = parseAniListId(1);
const tvdbId = parseTvdbId(2);
const tmdbId = parseTmdbId(3);

const validSonarrManualMapping = {
	anilistId,
	provider: "sonarr",
	providerId: tvdbId,
} satisfies SetManualMappingInput;

const validRadarrManualMapping = {
	anilistId,
	provider: "radarr",
	providerId: tmdbId,
} satisfies SetManualMappingInput;

const invalidRadarrManualMappingCandidate = {
	anilistId,
	provider: "radarr",
	providerId: tvdbId,
} as const;

// @ts-expect-error Radarr mapping IDs must be TMDB IDs.
const invalidRadarrManualMapping: SetManualMappingInput =
	invalidRadarrManualMappingCandidate;

void [validSonarrManualMapping, validRadarrManualMapping, invalidRadarrManualMapping];
