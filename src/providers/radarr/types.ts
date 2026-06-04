/** Radarr provider-domain types inferred from Valibot boundary schemas. */
// src/providers/radarr/types.ts

import type * as v from "valibot";

import type {
	RadarrAddPayloadOptionsSchema,
	RadarrAlternateTitleSchema,
	RadarrImageSchema,
	RadarrLookupMovieSchema,
	RadarrMovieSchema,
	RadarrMovieSnapshotSchema,
	RadarrQualityProfileSchema,
	RadarrRootFolderSchema,
	RadarrTagSchema,
} from "./schemas";

export type RadarrImage = v.InferOutput<typeof RadarrImageSchema>;
export type RadarrAlternateTitle = v.InferOutput<
	typeof RadarrAlternateTitleSchema
>;

export type RadarrMovie = v.InferOutput<typeof RadarrMovieSchema>;
export type RadarrLookupMovie = v.InferOutput<typeof RadarrLookupMovieSchema>;

export type RadarrRootFolder = v.InferOutput<typeof RadarrRootFolderSchema>;
export type RadarrQualityProfile = v.InferOutput<
	typeof RadarrQualityProfileSchema
>;
export type RadarrTag = v.InferOutput<typeof RadarrTagSchema>;

export type RadarrAddPayloadOptions = v.InferOutput<
	typeof RadarrAddPayloadOptionsSchema
>;

export type RadarrMovieSnapshot = v.InferOutput<
	typeof RadarrMovieSnapshotSchema
>;

export {
	type ProviderQualityProfileId as RadarrQualityProfileId,
	type ProviderTagId as RadarrTagId,
	type RadarrMovieId,
	type TmdbId,
} from "../schemas";
