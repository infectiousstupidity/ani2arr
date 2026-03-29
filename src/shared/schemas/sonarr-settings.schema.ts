/** Canonical Sonarr form and settings schemas for persisted defaults and RPC-bound form payloads. */
// src/shared/schemas/sonarr-settings.schema.ts

import * as v from 'valibot';
import {
  CoerceNumberArray,
  CoerceQualityProfileId,
  CoerceStringArray,
  SafeString,
  TITLE_LANGUAGES,
} from './schema-primitives';

export const SONARR_SERIES_TYPES = ['standard', 'anime', 'daily'] as const;
export const SONARR_MONITOR_OPTIONS = [
  'all',
  'future',
  'missing',
  'existing',
  'firstSeason',
  'lastSeason',
  'pilot',
  'recent',
  'monitorSpecials',
  'unmonitorSpecials',
  'none',
] as const;

export const SonarrSeriesTypeSchema = v.picklist(SONARR_SERIES_TYPES);
export type SonarrSeriesType = v.InferOutput<typeof SonarrSeriesTypeSchema>;

export const SonarrMonitorOptionSchema = v.picklist(SONARR_MONITOR_OPTIONS);
export type SonarrMonitorOption = v.InferOutput<typeof SonarrMonitorOptionSchema>;

/**
 * Strict Sonarr form state used once data is already inside the app or has
 * crossed another validated boundary such as RPC.
 */
export const SonarrFormStateSchema = v.object({
  qualityProfileId: v.union([v.number(), v.literal('')]),
  rootFolderPath: v.string(),
  seriesType: SonarrSeriesTypeSchema,
  monitorOption: SonarrMonitorOptionSchema,
  seasonFolder: v.boolean(),
  searchForMissingEpisodes: v.boolean(),
  searchForCutoffUnmetEpisodes: v.boolean(),
  tags: v.array(v.number()),
  freeformTags: v.array(v.string()),
});
export type SonarrFormState = v.InferOutput<typeof SonarrFormStateSchema>;

export function createDefaultSonarrFormState(): SonarrFormState {
  return {
    qualityProfileId: '',
    rootFolderPath: '',
    seriesType: 'anime',
    monitorOption: 'all',
    seasonFolder: true,
    searchForMissingEpisodes: true,
    searchForCutoffUnmetEpisodes: false,
    tags: [],
    freeformTags: [],
  };
}

/**
 * Storage-facing Sonarr defaults schema that accepts unknown input, coerces it
 * into the canonical form shape, and applies app defaults.
 */
export const SonarrDefaultsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    qualityProfileId: v.fallback(CoerceQualityProfileId, ''),
    rootFolderPath: SafeString,
    seriesType: v.fallback(SonarrSeriesTypeSchema, 'anime'),
    monitorOption: v.fallback(SonarrMonitorOptionSchema, 'all'),
    seasonFolder: v.fallback(v.boolean(), true),
    searchForMissingEpisodes: v.fallback(v.boolean(), true),
    searchForCutoffUnmetEpisodes: v.fallback(v.boolean(), false),
    tags: v.fallback(CoerceNumberArray, []),
    freeformTags: v.fallback(CoerceStringArray, []),
  }),
);

export const SonarrSettingsSchema = v.object({
  url: SafeString,
  apiKey: SafeString,
  providerTitleLanguage: v.fallback(v.picklist(TITLE_LANGUAGES), 'english'),
  defaults: v.fallback(SonarrDefaultsSchema, createDefaultSonarrFormState()),
});
