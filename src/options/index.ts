/** Public options-domain type surface for settings and public option contracts. */
// src/options/index.ts

export type {
  BadgeVisibility,
  ExtensionOptions,
  PublicOptions,
  UiOptions,
} from './types';
export {
  SettingsSchema,
  createDefaultSettings,
  defaultRadarrFormState,
  defaultSonarrFormState,
  defaultUiOptions,
} from './schema';
export {
  UiOptionsSchema,
  createDefaultUiOptions,
} from './ui-schema';
export {
  publicOptions,
  sonarrSecrets,
  radarrSecrets,
  parseSettings,
  toPublicOptions,
  getExtensionOptionsSnapshot,
  setExtensionOptionsSnapshot,
  getPublicOptionsSnapshot,
} from './store';
export {
  getProviderCredentials,
  isProviderConfigured,
} from './provider-config';
export {
  useExtensionOptions,
  usePublicOptions,
  useSaveOptions,
} from './queries';
