/** Valibot schemas for Sonarr API responses, RPC inputs, defaults, and cache rows. */
// src/providers/sonarr/schemas.ts

import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	SonarrSeriesIdSchema,
	TvdbIdSchema,
} from "../schemas";

export const SONARR_SERIES_TYPES = ["standard", "anime", "daily"] as const;

export const SONARR_MONITOR_OPTIONS = [
	"all",
	"future",
	"missing",
	"existing",
	"firstSeason",
	"lastSeason",
	"latestSeason",
	"pilot",
	"recent",
	"monitorSpecials",
	"unmonitorSpecials",
	"none",
] as const;

export const SONARR_EDIT_MONITORING_ACTIONS = [
	"noChange",
	...SONARR_MONITOR_OPTIONS,
] as const;

export const SONARR_MONITOR_NEW_ITEMS_OPTIONS = ["all", "none"] as const;

export const SONARR_SERIES_STATUSES = [
	"continuing",
	"ended",
	"upcoming",
	"deleted",
] as const;

// Static Sonarr series type used by add defaults, add payloads, and edit saves.
export const SonarrSeriesTypeSchema = v.picklist(SONARR_SERIES_TYPES);

// Add-time monitoring choice. Sonarr supports "unknown", but ani2arr never sends it.
export const SonarrMonitorOptionSchema = v.picklist(SONARR_MONITOR_OPTIONS);

// UI-only edit action for applying Sonarr's season pass monitoring endpoint.
export const SonarrEditMonitoringActionSchema = v.picklist(
	SONARR_EDIT_MONITORING_ACTIONS,
);

// Edit field for how Sonarr should monitor future seasons.
export const SonarrMonitorNewItemsOptionSchema = v.picklist(
	SONARR_MONITOR_NEW_ITEMS_OPTIONS,
);

// Display/cache status returned on Sonarr series and lookup results.
export const SonarrSeriesStatusSchema = v.picklist(SONARR_SERIES_STATUSES);

// Raw nested Sonarr response shape; normalized by SonarrAlternateTitlesSchema.
const SonarrAlternateTitleResourceSchema = v.object({
	title: v.optional(v.nullable(v.string())),
	sceneSeasonNumber: v.optional(v.nullable(v.number())),
	seasonNumber: v.optional(v.nullable(v.number())),
	sceneOrigin: v.optional(v.nullable(v.string())),
	comment: v.optional(v.nullable(v.string())),
});

// Normalized alternate title strings used by lookup results and library cache rows.
export const SonarrAlternateTitlesSchema = v.optional(
	v.pipe(
		v.nullable(v.array(SonarrAlternateTitleResourceSchema)),
		v.transform(
			(titles) =>
				titles
					?.map((entry) => entry.title?.trim())
					.filter((title): title is string => !!title) ?? undefined,
		),
	),
);

// Nested Sonarr stats used for library cache/display counts.
export const SonarrStatisticsSchema = v.object({
	seasonCount: v.optional(v.number()),
	episodeCount: v.optional(v.number()),
	episodeFileCount: v.optional(v.number()),
	totalEpisodeCount: v.optional(v.number()),
	sizeOnDisk: v.optional(v.number()),
});

// Nested season rows kept on existing series so edit saves can preserve Sonarr data.
export const SonarrSeasonSchema = v.object({
	seasonNumber: v.number(),
	monitored: v.boolean(),
	statistics: v.optional(SonarrStatisticsSchema),
});

// Nested cover/image rows used for modal headers and mapping search results.
export const SonarrImageSchema = v.object({
	coverType: v.optional(v.string()),
	url: v.optional(v.nullable(v.string())),
	remoteUrl: v.optional(v.nullable(v.string())),
});

// Nested POST /series addOptions payload.
export const SonarrAddPayloadOptionsSchema = v.object({
	monitor: SonarrMonitorOptionSchema,
	searchForMissingEpisodes: v.boolean(),
	searchForCutoffUnmetEpisodes: v.boolean(),
});

// Search/add candidate from Sonarr lookup. Used as the base for add payloads.
export const SonarrLookupSeriesSchema = v.object({
	id: v.optional(SonarrSeriesIdSchema),
	title: v.string(),
	tvdbId: TvdbIdSchema,
	titleSlug: v.optional(v.string()),
	folder: v.string(),
	year: v.optional(v.number()),
	genres: v.optional(v.array(v.string())),
	network: v.optional(v.string()),
	seriesType: v.optional(SonarrSeriesTypeSchema),
	status: v.optional(SonarrSeriesStatusSchema),
	seasons: v.optional(v.array(SonarrSeasonSchema)),
	images: v.optional(v.array(SonarrImageSchema)),
	remotePoster: v.optional(v.nullable(v.string())),
	overview: v.optional(v.string()),
	alternateTitles: SonarrAlternateTitlesSchema,
	statistics: v.optional(SonarrStatisticsSchema),
});

// Existing Sonarr library item. Used for library checks, edit mode, and save responses.
export const SonarrSeriesSchema = v.object({
	id: SonarrSeriesIdSchema,
	title: v.string(),
	tvdbId: TvdbIdSchema,
	titleSlug: v.string(),
	alternateTitles: SonarrAlternateTitlesSchema,
	monitored: v.boolean(),
	year: v.optional(v.number()),
	seasonCount: v.optional(v.number()),
	episodeCount: v.optional(v.number()),
	episodeFileCount: v.optional(v.number()),
	sizeOnDisk: v.optional(v.number()),
	path: v.string(),
	rootFolderPath: v.string(),
	qualityProfileId: ProviderQualityProfileIdSchema,
	seasons: v.optional(v.array(SonarrSeasonSchema)),
	seasonFolder: v.boolean(),
	monitorNewItems: SonarrMonitorNewItemsOptionSchema,
	seriesType: SonarrSeriesTypeSchema,
	tags: v.array(ProviderTagIdSchema),
	overview: v.optional(v.string()),
	images: v.optional(v.array(SonarrImageSchema)),
	status: v.optional(SonarrSeriesStatusSchema),
	statistics: v.optional(SonarrStatisticsSchema),
});

// GET /series/{id}/folder response used when previewing/saving path changes.
export const SonarrGeneratedFolderSchema = v.object({
	folder: v.string(),
});

// GET /rootfolder option row for add/edit forms.
export const SonarrRootFolderSchema = v.object({
	id: v.number(),
	path: v.string(),
	freeSpace: v.optional(v.nullable(v.number())),
	accessible: v.optional(v.boolean()),
});

// GET /qualityprofile option row for add/edit forms.
export const SonarrQualityProfileSchema = v.object({
	id: ProviderQualityProfileIdSchema,
	name: v.string(),
});

// GET /tag and POST /tag row for tag selection/creation.
export const SonarrTagSchema = v.object({
	id: ProviderTagIdSchema,
	label: v.string(),
});

// Add options used for both persisted defaults and submitted add form values.
export const SonarrAddOptionsSchema = v.object({
	rootFolderPath: v.string(),
	monitor: SonarrMonitorOptionSchema,
	qualityProfileId: ProviderQualityProfileIdSchema,
	seriesType: SonarrSeriesTypeSchema,
	seasonFolder: v.boolean(),
	searchForMissingEpisodes: v.boolean(),
	searchForCutoffUnmetEpisodes: v.boolean(),
	tags: v.array(ProviderTagIdSchema),
});

// Edit form values submitted from ani2arr before merging with the existing series.
export const SonarrEditOptionsSchema = v.object({
	monitored: v.boolean(),
	monitorNewItems: SonarrMonitorNewItemsOptionSchema,
	seasonFolder: v.boolean(),
	qualityProfileId: ProviderQualityProfileIdSchema,
	seriesType: SonarrSeriesTypeSchema,
	path: v.string(),
	rootFolderPath: v.string(),
	tags: v.array(ProviderTagIdSchema),
});

// RPC input for adding a mapped Sonarr series.
export const AddSonarrSeriesInputSchema = v.object({
	tvdbId: TvdbIdSchema,
	options: SonarrAddOptionsSchema,
});

// RPC input for updating an existing Sonarr series.
export const UpdateSonarrSeriesInputSchema = v.object({
	seriesId: SonarrSeriesIdSchema,
	options: SonarrEditOptionsSchema,
});

// Lean library cache row derived from SonarrSeries.
export const SonarrSeriesSnapshotSchema = v.object({
	id: SonarrSeriesIdSchema,
	tvdbId: TvdbIdSchema,
	title: v.string(),
	titleSlug: v.string(),
	alternateTitles: v.optional(v.array(v.string())),
	status: v.optional(SonarrSeriesStatusSchema),
	statistics: v.optional(
		v.object({
			episodeCount: v.optional(v.number()),
			episodeFileCount: v.optional(v.number()),
			totalEpisodeCount: v.optional(v.number()),
		}),
	),
});

// Lookup cache row for Sonarr search/add candidates.
export const SonarrLookupCacheRowSchema = v.object({
	tvdbId: TvdbIdSchema,
	series: SonarrLookupSeriesSchema,
	fetchedAt: v.number(),
});
