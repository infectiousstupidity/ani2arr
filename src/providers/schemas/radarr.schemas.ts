/** Focused Radarr API schemas for provider resources consumed by the app. */
// src/providers/schemas/radarr.schemas.ts

import * as v from "valibot";
import { RADARR_MINIMUM_AVAILABILITY_OPTIONS } from "@/providers/settings/provider-settings.schema";
import {
	ProviderIntegerSchema,
	ProviderNullableStringSchema,
	ProviderOptionalNullableIntegerSchema,
	ProviderOptionalNullableNumberSchema,
	ProviderOptionalNullableStringArraySchema,
	ProviderOptionalNullableStringSchema,
} from "./provider-shared.schemas";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	RadarrMovieIdSchema,
	TmdbIdSchema,
} from "@/providers/provider-id";

const RadarrAlternateTitleApiSchema = v.object({
	title: ProviderOptionalNullableStringSchema,
	sourceType: ProviderOptionalNullableStringSchema,
	movieMetadataId: ProviderOptionalNullableIntegerSchema,
});

const RadarrMediaCoverApiSchema = v.object({
	coverType: v.optional(v.string()),
	url: ProviderOptionalNullableStringSchema,
	remoteUrl: ProviderOptionalNullableStringSchema,
});

const RadarrMovieFileApiSchema = v.object({
	id: v.optional(ProviderIntegerSchema),
	path: ProviderOptionalNullableStringSchema,
	relativePath: ProviderOptionalNullableStringSchema,
	size: v.optional(ProviderIntegerSchema),
	quality: v.optional(v.unknown()),
});

export const RadarrMovieApiSchema = v.object({
	id: RadarrMovieIdSchema,
	title: ProviderNullableStringSchema,
	tmdbId: TmdbIdSchema,
	titleSlug: ProviderNullableStringSchema,
	qualityProfileId: ProviderQualityProfileIdSchema,
	rootFolderPath: ProviderNullableStringSchema,
	imdbId: ProviderOptionalNullableStringSchema,
	sortTitle: ProviderOptionalNullableStringSchema,
	originalTitle: ProviderOptionalNullableStringSchema,
	alternateTitles: v.optional(
		v.nullable(v.array(RadarrAlternateTitleApiSchema)),
	),
	monitored: v.optional(v.boolean()),
	year: v.optional(ProviderIntegerSchema),
	runtime: v.optional(ProviderIntegerSchema),
	status: v.optional(v.string()),
	overview: ProviderOptionalNullableStringSchema,
	genres: ProviderOptionalNullableStringArraySchema,
	path: ProviderOptionalNullableStringSchema,
	folderName: ProviderOptionalNullableStringSchema,
	folder: ProviderOptionalNullableStringSchema,
	minimumAvailability: v.optional(
		v.picklist(RADARR_MINIMUM_AVAILABILITY_OPTIONS),
	),
	tags: v.optional(v.nullable(v.array(ProviderTagIdSchema))),
	hasFile: v.optional(v.nullable(v.boolean())),
	movieFileId: v.optional(ProviderIntegerSchema),
	sizeOnDisk: ProviderOptionalNullableNumberSchema,
	added: v.optional(v.string()),
	inCinemas: ProviderOptionalNullableStringSchema,
	digitalRelease: ProviderOptionalNullableStringSchema,
	physicalRelease: ProviderOptionalNullableStringSchema,
	images: v.optional(v.nullable(v.array(RadarrMediaCoverApiSchema))),
	remotePoster: ProviderOptionalNullableStringSchema,
	movieFile: v.optional(v.nullable(RadarrMovieFileApiSchema)),
	addOptions: v.optional(
		v.object({
			searchForMovie: v.optional(v.boolean()),
		}),
	),
});

export const RadarrMovieApiArraySchema = v.array(RadarrMovieApiSchema);

export type RadarrMovieApi = v.InferOutput<typeof RadarrMovieApiSchema>;
