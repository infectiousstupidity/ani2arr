import * as v from 'valibot';
import type { RadarrFormState, RadarrMinimumAvailability } from '@/shared/providers/radarr/types';
import {
  TITLE_LANGUAGES,
  SafeString,
  CoerceQualityProfileId,
  CoerceNumberArray,
  CoerceStringArray,
} from './schema-primitives';

// --- Constants ---

const MINIMUM_AVAILABILITY_OPTIONS: [RadarrMinimumAvailability, ...RadarrMinimumAvailability[]] = [
  'announced',
  'inCinemas',
  'released',
  'preDB',
];

// --- Factory ---

export const createDefaultRadarrFormState = (): RadarrFormState => ({
  qualityProfileId: '',
  rootFolderPath: '',
  monitored: true,
  searchForMovie: true,
  minimumAvailability: 'released',
  tags: [],
  freeformTags: [],
});

// --- Schema ---

export const RadarrDefaultsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    qualityProfileId: v.fallback(CoerceQualityProfileId, ''),
    rootFolderPath: SafeString,
    monitored: v.fallback(v.boolean(), true),
    searchForMovie: v.fallback(v.boolean(), true),
    minimumAvailability: v.fallback(v.picklist(MINIMUM_AVAILABILITY_OPTIONS), 'released'),
    tags: v.fallback(CoerceNumberArray, []),
    freeformTags: v.fallback(CoerceStringArray, []),
  }),
);

export const RadarrSettingsSchema = v.object({
  url: SafeString,
  apiKey: SafeString,
  titleLanguage: v.fallback(v.picklist(TITLE_LANGUAGES), 'english'),
  defaults: v.fallback(RadarrDefaultsSchema, createDefaultRadarrFormState()),
});
