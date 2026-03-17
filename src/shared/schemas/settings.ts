// src/shared/schemas/settings.ts
import * as v from 'valibot';
import type { FieldValues } from 'react-hook-form';
import type { ExtensionOptions } from '@/shared/types/options';
import { createDefaultSonarrFormState, SonarrSettingsSchema } from './sonarr-schema';
import { createDefaultRadarrFormState, RadarrSettingsSchema } from './radarr-schema';
import { createDefaultUiOptions, isTitleLanguage, migrateLegacyUiOptions, UiOptionsSchema } from './ui-schema';

// --- Helpers ---

const asRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

// --- Factory ---

const createDefaultSettingsInternal = (): ExtensionOptions => ({
  providers: {
    sonarr: {
      url: '',
      apiKey: '',
      titleLanguage: 'english',
      defaults: createDefaultSonarrFormState(),
    },
    radarr: {
      url: '',
      apiKey: '',
      titleLanguage: 'english',
      defaults: createDefaultRadarrFormState(),
    },
  },
  ui: createDefaultUiOptions(),
  debugLogging: false,
});

// --- Migration ---

const migrateLegacySettings = (input: unknown): Record<string, unknown> => {
  const raw = asRecord(input);
  const providers = asRecord(raw.providers);
  const sonarr = asRecord(providers.sonarr);
  const radarr = asRecord(providers.radarr);
  const legacyTitleLanguage = isTitleLanguage(raw.titleLanguage) ? raw.titleLanguage : 'english';

  return {
    ...raw,
    providers: {
      ...providers,
      sonarr: {
        ...sonarr,
        titleLanguage: isTitleLanguage(sonarr.titleLanguage)
          ? sonarr.titleLanguage
          : legacyTitleLanguage,
      },
      radarr: {
        ...radarr,
        titleLanguage: isTitleLanguage(radarr.titleLanguage)
          ? radarr.titleLanguage
          : legacyTitleLanguage,
      },
    },
    ui: migrateLegacyUiOptions(raw.ui),
  };
};

// --- Composed Settings Schema ---

const ExtensionOptionsSchema = v.pipe(
  v.unknown(),
  v.transform(migrateLegacySettings),
  v.object({
    providers: v.object({
      sonarr: v.fallback(SonarrSettingsSchema, {
        url: '',
        apiKey: '',
        titleLanguage: 'english',
        defaults: createDefaultSonarrFormState(),
      }),
      radarr: v.fallback(RadarrSettingsSchema, {
        url: '',
        apiKey: '',
        titleLanguage: 'english',
        defaults: createDefaultRadarrFormState(),
      }),
    }),
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
export const defaultSonarrFormState = createDefaultSonarrFormState;
export const defaultRadarrFormState = createDefaultRadarrFormState;
export const defaultUiOptions = createDefaultUiOptions;
