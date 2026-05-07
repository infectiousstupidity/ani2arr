/** Sonarr provider-domain types inferred from Valibot boundary schemas. */
// src/providers/sonarr/types.ts

import type * as v from "valibot";

import type {
	AddSonarrSeriesInputSchema,
	SonarrAlternateTitlesSchema,
	SonarrAddPayloadOptionsSchema,
	SonarrAddOptionsSchema,
	SonarrEditOptionsSchema,
	SonarrGeneratedFolderSchema,
	SonarrImageSchema,
	SonarrLookupCacheRowSchema,
	SonarrLookupSeriesSchema,
	SonarrQualityProfileSchema,
	SonarrRootFolderSchema,
	SonarrSeasonSchema,
	SonarrSeriesSchema,
	SonarrSeriesSnapshotSchema,
	SonarrSeriesStatusSchema,
	SonarrTagSchema,
	UpdateSonarrSeriesInputSchema,
} from "./schemas";

export type SonarrSeriesStatus = v.InferOutput<typeof SonarrSeriesStatusSchema>;

export type SonarrAlternateTitles = v.InferOutput<
	typeof SonarrAlternateTitlesSchema
>;
export type SonarrSeason = v.InferOutput<typeof SonarrSeasonSchema>;
export type SonarrImage = v.InferOutput<typeof SonarrImageSchema>;

export type SonarrSeries = v.InferOutput<typeof SonarrSeriesSchema>;
export type SonarrLookupSeries = v.InferOutput<typeof SonarrLookupSeriesSchema>;
export type SonarrGeneratedFolder = v.InferOutput<
	typeof SonarrGeneratedFolderSchema
>;

export type SonarrRootFolder = v.InferOutput<typeof SonarrRootFolderSchema>;
export type SonarrQualityProfile = v.InferOutput<
	typeof SonarrQualityProfileSchema
>;
export type SonarrTag = v.InferOutput<typeof SonarrTagSchema>;

export type SonarrAddOptions = v.InferOutput<typeof SonarrAddOptionsSchema>;
export type SonarrAddPayloadOptions = v.InferOutput<
	typeof SonarrAddPayloadOptionsSchema
>;
export type SonarrAddDefaults = SonarrAddOptions;
export type SonarrAddDraft = {
	options: SonarrAddOptions;
	saveAsDefaults: boolean;
};

export type SonarrEditOptions = v.InferOutput<typeof SonarrEditOptionsSchema>;

export type AddSonarrSeriesInput = v.InferOutput<
	typeof AddSonarrSeriesInputSchema
>;

export type UpdateSonarrSeriesInput = v.InferOutput<
	typeof UpdateSonarrSeriesInputSchema
>;

export type SonarrSeriesSnapshot = v.InferOutput<
	typeof SonarrSeriesSnapshotSchema
>;

export type SonarrLookupCacheRow = v.InferOutput<
	typeof SonarrLookupCacheRowSchema
>;

export {
	type ProviderQualityProfileId as SonarrQualityProfileId,
	type ProviderTagId as SonarrTagId,
	type SonarrSeriesId,
	type TvdbId,
} from "../schemas";
