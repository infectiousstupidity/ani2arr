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

const SONARR_MONITOR_OPTION_DETAILS = {
  all: { label: 'All Episodes', description: 'Monitor all episodes except specials.' },
  future: { label: 'Future Episodes', description: 'Monitor episodes that have not aired yet.' },
  missing: {
    label: 'Missing Episodes',
    description: 'Monitor episodes that do not have files or have not aired yet.',
  },
  existing: {
    label: 'Existing Episodes',
    description: 'Monitor episodes that have files or have not aired yet.',
  },
  firstSeason: {
    label: 'First Season',
    description: 'Monitor all episodes of the first season. All other seasons will be ignored.',
  },
  lastSeason: {
    label: 'Last Season',
    description: 'Monitor all episodes of the last season.',
  },
  pilot: {
    label: 'Pilot Episode',
    description: 'Only monitor the first episode of the first season.',
  },
  recent: {
    label: 'Recent Episodes',
    description: 'Monitor episodes aired within the last 90 days and future episodes.',
  },
  monitorSpecials: {
    label: 'Monitor Specials',
    description: 'Monitor all special episodes without changing the monitored status of other episodes.',
  },
  unmonitorSpecials: {
    label: 'Unmonitor Specials',
    description: 'Unmonitor all special episodes without changing the monitored status of other episodes.',
  },
  none: { label: 'None', description: 'No episodes will be monitored.' },
} satisfies Record<SonarrMonitorOption, { label: string; description: string }>;

export const MONITOR_OPTIONS_WITH_DESCRIPTIONS = SONARR_MONITOR_OPTIONS.map(value => ({
  value,
  ...SONARR_MONITOR_OPTION_DETAILS[value],
}));

const SONARR_SERIES_TYPE_DETAILS = {
  standard: { label: 'Standard', description: 'Episodes released with SxxEyy pattern.' },
  anime: { label: 'Anime', description: 'Episodes released using an absolute episode number.' },
  daily: {
    label: 'Daily',
    description: 'Episodes released daily or less frequently that use year-month-day (2023-08-04).',
  },
} satisfies Record<SonarrSeriesType, { label: string; description: string }>;

export const SERIES_TYPE_OPTIONS_WITH_DESCRIPTIONS = SONARR_SERIES_TYPES.map(value => ({
  value,
  ...SONARR_SERIES_TYPE_DETAILS[value],
}));

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
