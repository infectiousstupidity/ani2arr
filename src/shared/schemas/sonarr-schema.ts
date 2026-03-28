/** Canonical Sonarr settings schemas and default factories for persisted provider options. */
// src/shared/schemas/sonarr-schema.ts

import * as v from 'valibot';
import type { SonarrFormState, SonarrMonitorOption } from '@/shared/providers/sonarr/types';
import {
  TITLE_LANGUAGES,
  SafeString,
  CoerceQualityProfileId,
  CoerceNumberArray,
  CoerceStringArray,
} from './schema-primitives';

// --- Constants ---

const SERIES_TYPES: [SonarrFormState['seriesType'], ...SonarrFormState['seriesType'][]] = [
  'standard',
  'anime',
  'daily',
];

const MONITOR_OPTIONS: [SonarrMonitorOption, ...SonarrMonitorOption[]] = [
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
];

// --- Factory ---

export const createDefaultSonarrFormState = (): SonarrFormState => ({
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  searchForCutoffUnmetEpisodes: false,
  tags: [],
  freeformTags: [],
});

// --- Schema ---

export const SonarrDefaultsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    qualityProfileId: v.fallback(CoerceQualityProfileId, ''),
    rootFolderPath: SafeString,
    seriesType: v.fallback(v.picklist(SERIES_TYPES), 'anime'),
    monitorOption: v.fallback(v.picklist(MONITOR_OPTIONS), 'all'),
    seasonFolder: v.fallback(v.boolean(), true),
    searchForMissingEpisodes: v.fallback(v.boolean(), true),
    searchForCutoffUnmetEpisodes: v.fallback(v.boolean(), false),
    tags: v.fallback(CoerceNumberArray, []),
    freeformTags: v.fallback(CoerceStringArray, []),
  })
);

export const SonarrSettingsSchema = v.object({
  url: SafeString,
  apiKey: SafeString,
  providerTitleLanguage: v.fallback(v.picklist(TITLE_LANGUAGES), 'english'),
  defaults: v.fallback(SonarrDefaultsSchema, createDefaultSonarrFormState()),
});
