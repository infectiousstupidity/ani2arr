/** Runtime-validated extension settings schema and default factories. */
// src/shared/schemas/settings.ts

import * as v from 'valibot';
import type { FieldValues } from 'react-hook-form';
import type { ExtensionOptions } from '@/shared/types/options';
import { createDefaultSonarrFormState, SonarrSettingsSchema } from './providers/sonarr-settings.schema';
import { createDefaultRadarrFormState, RadarrSettingsSchema } from './providers/radarr-settings.schema';
import { createDefaultUiOptions, UiOptionsSchema } from './ui-schema';

// --- Factory ---

const createDefaultSettingsInternal = (): ExtensionOptions => ({
  providers: {
    sonarr: {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultSonarrFormState(),
    },
    radarr: {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultRadarrFormState(),
    },
  },
  ui: createDefaultUiOptions(),
  debugLogging: false,
});

// --- Composed Settings Schema ---

const ExtensionOptionsSchema = v.object({
  providers: v.object({
    sonarr: v.fallback(SonarrSettingsSchema, {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultSonarrFormState(),
    }),
    radarr: v.fallback(RadarrSettingsSchema, {
      url: '',
      apiKey: '',
      preferredAniListTitleLanguage: 'english',
      defaults: createDefaultRadarrFormState(),
    }),
  }),
  ui: v.fallback(UiOptionsSchema, createDefaultUiOptions()),
  debugLogging: v.fallback(v.boolean(), false),
});

export const SettingsSchema = v.fallback(ExtensionOptionsSchema, createDefaultSettingsInternal());

// Export intersection to enforce strict contract with types/options
export type Settings = v.InferOutput<typeof SettingsSchema> & ExtensionOptions;
export type SettingsFormValues = Settings & FieldValues;

export const createDefaultSettings = createDefaultSettingsInternal;
export const defaultSettings = createDefaultSettingsInternal;
export const defaultSonarrFormState = createDefaultSonarrFormState;
export const defaultRadarrFormState = createDefaultRadarrFormState;
export const defaultUiOptions = createDefaultUiOptions;
