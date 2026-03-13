// src/shared/schemas/settings.ts
import * as v from 'valibot';
import type { FieldValues } from 'react-hook-form';
import type {
  BadgeVisibility,
  ExtensionOptions,
  RadarrFormState,
  SonarrFormState,
  TitleLanguage,
  UiOptions,
} from '@/shared/types/options';
import type { RadarrMinimumAvailability, SonarrMonitorOption } from '@/shared/types/providers';

// --- Constants ---

const TITLE_LANGUAGES: [TitleLanguage, ...TitleLanguage[]] = [
  'english',
  'romaji',
  'native',
];

const BADGE_VISIBILITY_OPTIONS: [BadgeVisibility, ...BadgeVisibility[]] = [
  'always',
  'hover',
  'hidden',
];

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

const MINIMUM_AVAILABILITY_OPTIONS: [RadarrMinimumAvailability, ...RadarrMinimumAvailability[]] = [
  'announced',
  'inCinemas',
  'released',
  'preDB',
];

// --- Factories ---

const createDefaultFormState = (): SonarrFormState => ({
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  searchForCutoffUnmet: false,
  tags: [],
  freeformTags: [],
});

const createDefaultRadarrFormState = (): RadarrFormState => ({
  qualityProfileId: '',
  rootFolderPath: '',
  monitored: true,
  searchForMovie: true,
  minimumAvailability: 'released',
  tags: [],
  freeformTags: [],
});

const createDefaultUiOptions = (): UiOptions => ({
  browseOverlayEnabled: true,
  badgeVisibility: 'always',
  headerInjectionEnabled: true,
  schedulerDebugOverlayEnabled: false,
});

const createDefaultSettingsInternal = (): ExtensionOptions => ({
  providers: {
    sonarr: {
      url: '',
      apiKey: '',
      defaults: createDefaultFormState(),
    },
    radarr: {
      url: '',
      apiKey: '',
      defaults: createDefaultRadarrFormState(),
    },
  },
  titleLanguage: 'english',
  ui: createDefaultUiOptions(),
  debugLogging: false,
});

// --- Reusable Coercion Schemas ---

// Trims strings, falls back to empty string
const SafeString = v.fallback(
  v.pipe(v.string(), v.transform((s) => s.trim())),
  ''
);

// Handles number | string -> number | ''.
const CoerceQualityProfileId = v.pipe(
  v.unknown(),
  v.transform((input): number | '' => {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string' && input.trim().length > 0) {
      const parsed = Number(input);
      return Number.isFinite(parsed) ? parsed : '';
    }
    return '';
  })
);

// Handles array | single item -> array. Filters invalid numbers.
const CoerceNumberArray = v.pipe(
  v.unknown(),
  v.transform((input) => {
    const list = Array.isArray(input) ? input : [input];
    return list.reduce<number[]>((acc, item) => {
      const num = Number(item);
      if (Number.isFinite(num)) acc.push(num);
      return acc;
    }, []);
  }),
  v.array(v.number())
);

// Handles array | single item -> array. Trims and filters empty strings.
const CoerceStringArray = v.pipe(
  v.unknown(),
  v.transform((input) => {
    const list = Array.isArray(input) ? input : [input];
    return list.reduce<string[]>((acc, item) => {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) acc.push(trimmed);
      }
      return acc;
    }, []);
  }),
  v.array(v.string())
);

// --- Object Schemas ---

const SonarrDefaultsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    qualityProfileId: v.fallback(CoerceQualityProfileId, ''),
    rootFolderPath: SafeString,
    seriesType: v.fallback(v.picklist(SERIES_TYPES), 'anime'),
    monitorOption: v.fallback(v.picklist(MONITOR_OPTIONS), 'all'),
    seasonFolder: v.fallback(v.boolean(), true),
    searchForMissingEpisodes: v.fallback(v.boolean(), true),
    searchForCutoffUnmet: v.fallback(v.boolean(), false),
    tags: v.fallback(CoerceNumberArray, []),
    freeformTags: v.fallback(CoerceStringArray, []),
  })
);

const RadarrDefaultsSchema = v.pipe(
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

const UiOptionsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    browseOverlayEnabled: v.fallback(v.boolean(), true),
    badgeVisibility: v.fallback(v.picklist(BADGE_VISIBILITY_OPTIONS), 'always'),
    headerInjectionEnabled: v.fallback(v.boolean(), true),
    schedulerDebugOverlayEnabled: v.fallback(v.boolean(), false),
  })
);

const SonarrSettingsSchema = v.object({
  url: SafeString,
  apiKey: SafeString,
  defaults: v.fallback(SonarrDefaultsSchema, createDefaultFormState()),
});

const RadarrSettingsSchema = v.object({
  url: SafeString,
  apiKey: SafeString,
  defaults: v.fallback(RadarrDefaultsSchema, createDefaultRadarrFormState()),
});

// Main Settings Schema
const ExtensionOptionsSchema = v.pipe(
  v.unknown(),
  v.transform((input) => (input && typeof input === 'object' ? input : {})),
  v.object({
    providers: v.object({
      sonarr: v.fallback(SonarrSettingsSchema, {
        url: '',
        apiKey: '',
        defaults: createDefaultFormState(),
      }),
      radarr: v.fallback(RadarrSettingsSchema, {
        url: '',
        apiKey: '',
        defaults: createDefaultRadarrFormState(),
      }),
    }),
    titleLanguage: v.fallback(v.picklist(TITLE_LANGUAGES), 'english'),
    ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
    debugLogging: v.fallback(v.boolean(), false),
  })
);

export const SettingsSchema = v.fallback(ExtensionOptionsSchema, createDefaultSettingsInternal());

// Export intersection to enforce strict contract with types/options
export type Settings = v.InferOutput<typeof SettingsSchema> & ExtensionOptions;
export type SettingsFormValues = Settings & FieldValues;

export const createDefaultSettings = createDefaultSettingsInternal;
export const defaultSettings = createDefaultSettingsInternal;
export const defaultSonarrFormState = createDefaultFormState;
export const defaultRadarrFormState = createDefaultRadarrFormState;
export const defaultUiOptions = createDefaultUiOptions;
