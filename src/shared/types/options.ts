// src/shared/types/options.ts
import type { SonarrFormState } from '@/shared/providers/sonarr/types';
import type { RadarrFormState } from '@/shared/providers/radarr/types';

export type Provider = 'sonarr' | 'radarr';
export type ProviderTitleLanguage = 'english' | 'romaji' | 'native';

export interface ProviderCredentials {
  url: string;
  apiKey: string;
}

export type BadgeVisibility = 'always' | 'hover';

export interface ProviderBrowseCardUiOptions {
  enabled: boolean;
  visibility: BadgeVisibility;
}

export interface ProviderAnimePageUiOptions {
  enabled: boolean;
}

export interface ProviderUiOptions {
  sonarr: ProviderBrowseCardUiOptions;
  radarr: ProviderBrowseCardUiOptions;
}

export interface ProviderAnimePageOptions {
  sonarr: ProviderAnimePageUiOptions;
  radarr: ProviderAnimePageUiOptions;
}

export interface UiOptions {
  browseCards: ProviderUiOptions;
  animePages: ProviderAnimePageOptions;
  schedulerDebugOverlayEnabled: boolean;
}

export interface SonarrOptions extends ProviderCredentials {
  providerTitleLanguage: ProviderTitleLanguage;
  defaults: SonarrFormState;
}

export interface RadarrOptions extends ProviderCredentials {
  providerTitleLanguage: ProviderTitleLanguage;
  defaults: RadarrFormState;
}

export interface SonarrPublicOptions {
  url: string;
  providerTitleLanguage: ProviderTitleLanguage;
  defaults: SonarrFormState;
  isConfigured: boolean;
}

export interface RadarrPublicOptions {
  url: string;
  providerTitleLanguage: ProviderTitleLanguage;
  defaults: RadarrFormState;
  isConfigured: boolean;
}

export interface ExtensionOptions {
  providers: {
    sonarr: SonarrOptions;
    radarr: RadarrOptions;
  };
  ui: UiOptions;
  debugLogging: boolean;
}

/**
 * Public-facing configuration data that is safe to expose to content scripts.
 * Secrets like provider API keys are intentionally excluded.
 */
export interface PublicOptions {
  providers: {
    sonarr: SonarrPublicOptions;
    radarr: RadarrPublicOptions;
  };
  ui: UiOptions;
  debugLogging: boolean;
}
