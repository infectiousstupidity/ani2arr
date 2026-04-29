/** Focused Sonarr API schemas for provider resources consumed by the app. */
// src/providers/schemas/sonarr.schemas.ts

import * as v from "valibot";
import {
	SONARR_MONITOR_OPTIONS,
	SONARR_SERIES_TYPES,
} from "@/providers/settings/provider-settings.schema";
import {
	ProviderOptionalNullableIntegerSchema,
	ProviderOptionalNullableStringArraySchema,
	ProviderOptionalNullableStringSchema,
	ProviderNullableStringSchema,
	ProviderIntegerSchema,
} from "./provider-shared.schemas";
import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	SonarrSeriesIdSchema,
	TvdbIdSchema,
} from "@/providers/provider-id";

export const SONARR_SERIES_STATUS_VALUES = [
	"continuing",
	"ended",
	"upcoming",
	"deleted",
] as const;

export const SONARR_NEW_ITEM_MONITOR_VALUES = ["all", "none"] as const;

export const SonarrSeriesStatusApiSchema = v.picklist(
	SONARR_SERIES_STATUS_VALUES,
);

export const SonarrNewItemMonitorApiSchema = v.picklist(
	SONARR_NEW_ITEM_MONITOR_VALUES,
);

const SonarrAlternateTitleApiSchema = v.object({
	title: ProviderOptionalNullableStringSchema,
	sceneSeasonNumber: ProviderOptionalNullableIntegerSchema,
	seasonNumber: ProviderOptionalNullableIntegerSchema,
	sceneOrigin: ProviderOptionalNullableStringSchema,
	sourceType: ProviderOptionalNullableStringSchema,
});

const SonarrMediaCoverApiSchema = v.object({
	coverType: v.optional(v.string()),
	url: ProviderOptionalNullableStringSchema,
	remoteUrl: ProviderOptionalNullableStringSchema,
});

const SonarrStatisticsApiSchema = v.object({
	seasonCount: v.optional(ProviderIntegerSchema),
	episodeCount: v.optional(ProviderIntegerSchema),
	episodeFileCount: v.optional(ProviderIntegerSchema),
	totalEpisodeCount: v.optional(ProviderIntegerSchema),
	sizeOnDisk: v.optional(ProviderIntegerSchema),
});

const SonarrAddOptionsApiSchema = v.object({
	monitor: v.optional(v.picklist(SONARR_MONITOR_OPTIONS)),
	searchForMissingEpisodes: v.optional(v.boolean()),
	searchForCutoffUnmetEpisodes: v.optional(v.boolean()),
});

export const SonarrSeriesApiSchema = v.object({
	id: SonarrSeriesIdSchema,
	title: ProviderNullableStringSchema,
	tvdbId: TvdbIdSchema,
	titleSlug: ProviderNullableStringSchema,
	qualityProfileId: ProviderQualityProfileIdSchema,
	rootFolderPath: ProviderNullableStringSchema,
	alternateTitles: v.optional(
		v.nullable(v.array(SonarrAlternateTitleApiSchema)),
	),
	monitored: v.optional(v.boolean()),
	year: v.optional(ProviderIntegerSchema),
	genres: ProviderOptionalNullableStringArraySchema,
	seasonCount: v.optional(ProviderIntegerSchema),
	episodeCount: v.optional(ProviderIntegerSchema),
	episodeFileCount: v.optional(ProviderIntegerSchema),
	sizeOnDisk: v.optional(ProviderIntegerSchema),
	path: ProviderOptionalNullableStringSchema,
	folder: ProviderOptionalNullableStringSchema,
	languageProfileId: v.optional(ProviderIntegerSchema),
	seasons: v.optional(v.nullable(v.array(v.unknown()))),
	seasonFolder: v.optional(v.boolean()),
	monitorNewItems: v.optional(SonarrNewItemMonitorApiSchema),
	addOptions: v.optional(SonarrAddOptionsApiSchema),
	seriesType: v.optional(v.picklist(SONARR_SERIES_TYPES)),
	tags: v.optional(v.nullable(v.array(ProviderTagIdSchema))),
	added: v.optional(v.string()),
	overview: ProviderOptionalNullableStringSchema,
	previousAiring: ProviderOptionalNullableStringSchema,
	network: ProviderOptionalNullableStringSchema,
	images: v.optional(v.nullable(v.array(SonarrMediaCoverApiSchema))),
	remotePoster: ProviderOptionalNullableStringSchema,
	status: v.optional(SonarrSeriesStatusApiSchema),
	statistics: v.optional(SonarrStatisticsApiSchema),
});

export const SonarrSeriesApiArraySchema = v.array(SonarrSeriesApiSchema);

export type SonarrSeriesStatusApi = v.InferOutput<
	typeof SonarrSeriesStatusApiSchema
>;
export type SonarrNewItemMonitorApi = v.InferOutput<
	typeof SonarrNewItemMonitorApiSchema
>;
export type SonarrSeriesApi = v.InferOutput<typeof SonarrSeriesApiSchema>;
