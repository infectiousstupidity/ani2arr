/** Radarr provider-domain types inferred from Valibot boundary schemas. */
// src/providers/radarr/types.ts

import type * as v from "valibot";

import type {
	RadarrAddPayloadOptionsSchema,
	RadarrAlternateTitleSchema,
	RadarrImageSchema,
	RadarrLookupMovieSchema,
	RadarrMinimumAvailability,
	RadarrMovieMonitor,
	RadarrMovieSchema,
	RadarrMovieSnapshotSchema,
	RadarrQualityProfileSchema,
	RadarrRootFolderSchema,
	RadarrTagSchema,
} from "./schemas";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
} from "../schemas";

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
export type RadarrAddMoviePayload = Omit<
	RadarrLookupMovie,
	| "addOptions"
	| "id"
	| "minimumAvailability"
	| "monitored"
	| "qualityProfileId"
	| "rootFolderPath"
	| "tags"
> & {
	id: 0;
	rootFolderPath: string;
	qualityProfileId: ProviderQualityProfileId;
	monitored: boolean;
	minimumAvailability: RadarrMinimumAvailability;
	tags: ProviderTagId[];
	addOptions: { monitor: RadarrMovieMonitor; searchForMovie: boolean };
};

export type RadarrMovieSnapshot = v.InferOutput<
	typeof RadarrMovieSnapshotSchema
>;
