/** Sonarr provider-domain types inferred from Valibot boundary schemas. */
// src/providers/sonarr/types.ts

import type * as v from "valibot";

import type {
	AddSonarrSeriesInputSchema,
	SonarrAddPayloadOptionsSchema,
	SonarrEditOptionsSchema,
	SonarrGeneratedFolderSchema,
	SonarrLookupSeriesSchema,
	SonarrQualityProfileSchema,
	SonarrRootFolderSchema,
	SonarrSeriesSchema,
	SonarrSeriesSnapshotSchema,
	SonarrSeriesType,
	SonarrTagSchema,
	UpdateSonarrSeriesInputSchema,
} from "./schemas";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
} from "../schemas";



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

type SonarrAddPayloadOptions = v.InferOutput<
	typeof SonarrAddPayloadOptionsSchema
>;
export type SonarrAddSeriesPayload = SonarrLookupSeries & {
	rootFolderPath: string;
	qualityProfileId: ProviderQualityProfileId;
	seriesType: SonarrSeriesType;
	seasonFolder: boolean;
	monitored: boolean;
	tags: ProviderTagId[];
	addOptions: SonarrAddPayloadOptions;
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
