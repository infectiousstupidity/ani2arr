/** Valibot schemas for Radarr API responses, payload shapes, and cache rows. */
// src/providers/radarr/schemas.ts

import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	RadarrMovieIdSchema,
	TmdbIdSchema,
} from "../schemas";

export const RADARR_MINIMUM_AVAILABILITY_OPTIONS = [
	"tba",
	"announced",
	"inCinemas",
	"released",
	"deleted",
] as const;

export const RADARR_MOVIE_MONITOR_OPTIONS = [
	"movieOnly",
	"movieAndCollection",
	"none",
] as const;

export const RadarrMinimumAvailabilitySchema = v.picklist(
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
);
export type RadarrMinimumAvailability = v.InferOutput<
	typeof RadarrMinimumAvailabilitySchema
>;

export const RadarrMovieMonitorSchema = v.picklist(
	RADARR_MOVIE_MONITOR_OPTIONS,
);
export type RadarrMovieMonitor = v.InferOutput<
	typeof RadarrMovieMonitorSchema
>;

const OptionalStringSchema = v.optional(v.nullable(v.string()));
const OptionalNumberSchema = v.optional(v.nullable(v.number()));
const RequiredTitleSchema = v.pipe(v.string(), v.nonEmpty());
const OptionalLookupIdSchema = v.optional(
	v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0)),
);

export const RadarrImageSchema = v.object({
	coverType: v.optional(v.string()),
	url: OptionalStringSchema,
	remoteUrl: OptionalStringSchema,
});

export const RadarrAlternateTitleSchema = v.object({
	title: OptionalStringSchema,
	sourceType: OptionalStringSchema,
	movieMetadataId: OptionalNumberSchema,
});

export const RadarrLookupMovieSchema = v.object({
	id: OptionalLookupIdSchema,
	title: RequiredTitleSchema,
	tmdbId: TmdbIdSchema,
	imdbId: OptionalStringSchema,
	titleSlug: v.optional(v.string()),
	originalTitle: v.optional(v.string()),
	folderName: v.optional(v.string()),
	remotePoster: OptionalStringSchema,
	year: v.optional(v.number()),
	runtime: v.optional(v.number()),
	status: v.optional(v.string()),
	overview: v.optional(v.string()),
	images: v.optional(v.array(RadarrImageSchema)),
	alternateTitles: v.optional(v.array(RadarrAlternateTitleSchema)),
	hasFile: v.optional(v.boolean()),
});

export const RadarrMovieSchema = v.object({
	id: RadarrMovieIdSchema,
	title: RequiredTitleSchema,
	tmdbId: TmdbIdSchema,
	path: v.string(),
	rootFolderPath: v.string(),
	qualityProfileId: ProviderQualityProfileIdSchema,
	monitored: v.boolean(),
	tags: v.array(ProviderTagIdSchema),
	titleSlug: v.optional(v.string()),
	sortTitle: v.optional(v.string()),
	originalTitle: v.optional(v.string()),
	folderName: v.optional(v.string()),
	imdbId: OptionalStringSchema,
	year: v.optional(v.number()),
	runtime: v.optional(v.number()),
	status: v.optional(v.string()),
	overview: v.optional(v.string()),
	images: v.optional(v.array(RadarrImageSchema)),
	alternateTitles: v.optional(v.array(RadarrAlternateTitleSchema)),
	minimumAvailability: v.optional(RadarrMinimumAvailabilitySchema),
	hasFile: v.optional(v.boolean()),
	sizeOnDisk: v.optional(v.number()),
});

export const RadarrRootFolderSchema = v.object({
	id: v.number(),
	path: v.string(),
	freeSpace: v.optional(v.nullable(v.number())),
	accessible: v.optional(v.boolean()),
});

export const RadarrQualityProfileSchema = v.object({
	id: ProviderQualityProfileIdSchema,
	name: v.string(),
});

export const RadarrTagSchema = v.object({
	id: ProviderTagIdSchema,
	label: v.string(),
});

export const RadarrAddPayloadOptionsSchema = v.object({
	monitor: RadarrMovieMonitorSchema,
	searchForMovie: v.boolean(),
});

export const RadarrMovieSnapshotSchema = v.object({
	tmdbId: TmdbIdSchema,
	id: RadarrMovieIdSchema,
	title: v.string(),
	titleSlug: v.optional(v.string()),
	sortTitle: v.optional(v.string()),
	originalTitle: v.optional(v.string()),
	folderName: v.optional(v.string()),
	imdbId: OptionalStringSchema,
	year: v.optional(v.number()),
	alternateTitles: v.optional(v.array(v.string())),
	monitored: v.optional(v.boolean()),
	minimumAvailability: v.optional(RadarrMinimumAvailabilitySchema),
	hasFile: v.optional(v.boolean()),
	sizeOnDisk: v.optional(v.number()),
	status: v.optional(v.string()),
});
