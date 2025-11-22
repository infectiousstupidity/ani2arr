// src/shared/utils/storage.ts

/**
 * @file Defines and exports user-configurable extension settings.
 * Public-facing configuration is stored separately from sensitive
 * Sonarr credentials so that content scripts never touch the API key.
 */
import { storage } from '@wxt-dev/storage';
import { validateUrl, validateApiKey } from '@/shared/utils/validation';
import type {
  ExtensionOptions,
  PublicOptions,
  SonarrFormState,
  SonarrSecrets,
  TitleLanguage,
} from '@/shared/types';

const getDefaultFormState = (): SonarrFormState => ({
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  tags: [],
});

const DEFAULT_TITLE_LANGUAGE: TitleLanguage = 'english';

const createDefaultPublicOptions = (): PublicOptions => ({
  sonarrUrl: '',
  defaults: getDefaultFormState(),
  titleLanguage: DEFAULT_TITLE_LANGUAGE,
  isConfigured: false,
});

const createDefaultSecrets = (): SonarrSecrets => ({
  apiKey: '',
});

/**
 * Public configuration safe for content scripts. This intentionally excludes
 * the Sonarr API key and only mirrors a derived `isConfigured` flag.
 */
export const publicOptions = storage.defineItem<PublicOptions>('local:publicOptions', {
  fallback: createDefaultPublicOptions(),
  version: 1,
});

/**
 * Sensitive credentials that may only be accessed from privileged contexts.
 */
export const sonarrSecrets = storage.defineItem<SonarrSecrets>('local:sonarrSecrets', {
  fallback: createDefaultSecrets(),
  version: 1,
});

interface HasDefaults {
  defaults: SonarrFormState;
}

const mergeDefaults = <T extends HasDefaults>(options: T): T => ({
  ...options,
  defaults: {
    ...getDefaultFormState(),
    ...options.defaults,
  },
});

/**
 * Fetches the combined extension options (including secrets) for use in
 * background and options contexts.
 */
export async function getExtensionOptionsSnapshot(): Promise<ExtensionOptions> {
  const [pub, secrets] = await Promise.all([publicOptions.getValue(), sonarrSecrets.getValue()]);
  return {
    sonarrUrl: pub.sonarrUrl,
    sonarrApiKey: secrets.apiKey,
    defaults: mergeDefaults(pub).defaults,
    titleLanguage: pub.titleLanguage ?? DEFAULT_TITLE_LANGUAGE,
  };
}

/**
 * Persists the full extension options, splitting the public slice from secrets.
 * Exposes a single call site for writes to keep the boolean mirror in sync.
 */
export async function setExtensionOptionsSnapshot(options: ExtensionOptions): Promise<void> {
  const sanitized = mergeDefaults(options);

  // Defensive validation: only validate/normalize non-empty values. Empty
  // values are permitted to allow clearing configuration.
  let normalizedUrl = sanitized.sonarrUrl ?? '';
  if (normalizedUrl && normalizedUrl.trim() !== '') {
    const v = validateUrl(normalizedUrl);
    if (!v.isValid) {
      throw new Error(`Invalid Sonarr URL: ${v.error ?? 'unknown'}`);
    }
    normalizedUrl = v.normalizedUrl ?? normalizedUrl;
  }

  let apiKey = sanitized.sonarrApiKey ?? '';
  if (apiKey && apiKey.trim() !== '') {
    const k = validateApiKey(apiKey);
    if (!k.isValid) {
      throw new Error(`Invalid Sonarr API key: ${k.error ?? 'invalid format'}`);
    }
    apiKey = apiKey.trim();
  }

  const titleLanguage: TitleLanguage =
    sanitized.titleLanguage === 'romaji' || sanitized.titleLanguage === 'native'
      ? sanitized.titleLanguage
      : DEFAULT_TITLE_LANGUAGE;

  await Promise.all([
    publicOptions.setValue({
      sonarrUrl: normalizedUrl,
      defaults: sanitized.defaults,
      titleLanguage,
      isConfigured: Boolean(normalizedUrl && apiKey),
    }),
    sonarrSecrets.setValue({ apiKey }),
  ]);
}

/**
 * Returns the current public configuration, merging in default values so
 * callers never have to defensively clone structures.
 */
export async function getPublicOptionsSnapshot(): Promise<PublicOptions> {
  const pub = await publicOptions.getValue();
  return {
    sonarrUrl: pub.sonarrUrl,
    defaults: mergeDefaults(pub).defaults,
    titleLanguage: pub.titleLanguage ?? DEFAULT_TITLE_LANGUAGE,
    isConfigured: pub.isConfigured,
  };
}
