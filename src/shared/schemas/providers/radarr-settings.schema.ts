/** Canonical Radarr form and settings schemas for persisted defaults and RPC-bound form payloads. */
// src/shared/schemas/radarr-settings.schema.ts

import * as v from 'valibot';
import { AniListTitleLanguageSchema } from '@/shared/schemas/anilist/anilist-title-language.schema';
import {
  CoerceNumberArray,
  CoerceQualityProfileId,
  CoerceStringArray,
  SafeString,
} from '../schema-primitives';

export const RADARR_MINIMUM_AVAILABILITY_OPTIONS = [
  'announced',
  'inCinemas',
  'released',
  'preDB',
] as const;

export const RadarrMinimumAvailabilitySchema = v.picklist(RADARR_MINIMUM_AVAILABILITY_OPTIONS);
export type RadarrMinimumAvailability = v.InferOutput<typeof RadarrMinimumAvailabilitySchema>;

const RADARR_MINIMUM_AVAILABILITY_DETAILS = {
  announced: {
    label: 'Announced',
    description: 'Allow adds before a theatrical or digital date exists.',
  },
  inCinemas: {
    label: 'In Cinemas',
    description: 'Wait until the movie has a theatrical release.',
  },
  released: {
    label: 'Released',
    description: 'Wait until the movie is officially released.',
  },
  preDB: {
    label: 'PreDB',
    description: 'Allow pre-release availability.',
  },
} satisfies Record<RadarrMinimumAvailability, { label: string; description: string }>;

export const MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS =
  RADARR_MINIMUM_AVAILABILITY_OPTIONS.map(value => ({
    value,
    ...RADARR_MINIMUM_AVAILABILITY_DETAILS[value],
  }));

/**
 * Strict Radarr form state used once data is already inside the app or has
 * crossed another validated boundary such as RPC.
 */
export const RadarrFormStateSchema = v.object({
  qualityProfileId: v.union([v.number(), v.literal('')]),
  rootFolderPath: v.string(),
  monitored: v.boolean(),
  searchForMovie: v.boolean(),
  minimumAvailability: RadarrMinimumAvailabilitySchema,
  tags: v.array(v.number()),
  freeformTags: v.array(v.string()),
});
export type RadarrFormState = v.InferOutput<typeof RadarrFormStateSchema>;

export function createDefaultRadarrFormState(): RadarrFormState {
  return {
    qualityProfileId: '',
    rootFolderPath: '',
    monitored: true,
    searchForMovie: true,
    minimumAvailability: 'released',
    tags: [],
    freeformTags: [],
  };
}

/**
 * Storage-facing Radarr defaults schema that accepts unknown input, coerces it
 * into the canonical form shape, and applies app defaults.
 */
export const RadarrDefaultsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    qualityProfileId: v.fallback(CoerceQualityProfileId, ''),
    rootFolderPath: SafeString,
    monitored: v.fallback(v.boolean(), true),
    searchForMovie: v.fallback(v.boolean(), true),
    minimumAvailability: v.fallback(RadarrMinimumAvailabilitySchema, 'released'),
    tags: v.fallback(CoerceNumberArray, []),
    freeformTags: v.fallback(CoerceStringArray, []),
  }),
);

export const RadarrSettingsSchema = v.object({
  url: SafeString,
  apiKey: SafeString,
  preferredAniListTitleLanguage: v.fallback(AniListTitleLanguageSchema, 'english'),
  defaults: v.fallback(RadarrDefaultsSchema, createDefaultRadarrFormState()),
});
