// src/utils/storage.ts

/**
 * @file Defines and exports user-configurable extension settings.
 * Public-facing configuration is stored separately from sensitive
 * Sonarr credentials so that content scripts never touch the API key.
 */
import { storage } from '@wxt-dev/storage';
import type {
  ExtensionOptions,
  PublicOptions,
  SonarrFormState,
  SonarrSecrets,
} from '@/types';

const getDefaultFormState = (): SonarrFormState => ({
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  tags: [],
});

const createDefaultPublicOptions = (): PublicOptions => ({
  sonarrUrl: '',
  defaults: getDefaultFormState(),
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
  };
}

/**
 * Persists the full extension options, splitting the public slice from secrets.
 * Exposes a single call site for writes to keep the boolean mirror in sync.
 */
export async function setExtensionOptionsSnapshot(options: ExtensionOptions): Promise<void> {
  const sanitized = mergeDefaults(options);
  await Promise.all([
    publicOptions.setValue({
      sonarrUrl: sanitized.sonarrUrl,
      defaults: sanitized.defaults,
      isConfigured: Boolean(sanitized.sonarrUrl && sanitized.sonarrApiKey),
    }),
    sonarrSecrets.setValue({ apiKey: sanitized.sonarrApiKey }),
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
    isConfigured: pub.isConfigured,
  };
}
