// src/shared/utils/storage.ts

/**
 * @file Defines and exports user-configurable extension settings.
 * Public-facing configuration is stored separately from sensitive
 * Sonarr credentials so that content scripts never touch the API key.
 */
import { storage } from '@wxt-dev/storage';
import * as v from 'valibot';
import { SettingsSchema, createDefaultSettings } from '@/shared/schemas/settings';
import type { Settings } from '@/shared/schemas/settings';
import type { ExtensionOptions, PublicOptions, SonarrSecrets } from '@/shared/types';
import { validateUrl, validateApiKey } from '@/shared/sonarr/validation';
import { logger } from '@/shared/utils/logger';

const createDefaultPublicOptions = (): PublicOptions => {
  const defaults = createDefaultSettings();
  return {
    sonarrUrl: defaults.sonarrUrl,
    defaults: defaults.defaults,
    titleLanguage: defaults.titleLanguage,
    ui: defaults.ui,
    debugLogging: defaults.debugLogging,
    isConfigured: false,
  };
};

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

export const parseSettings = (raw: unknown): Settings => {
  const result = v.safeParse(SettingsSchema, raw);
  if (result.success) return result.output;
  logger.warn('Storage mismatch, applying defaults', result.issues);
  return v.parse(SettingsSchema, raw ?? {});
};

export const toPublicOptions = (settings: Settings): PublicOptions => ({
  sonarrUrl: settings.sonarrUrl,
  defaults: settings.defaults,
  titleLanguage: settings.titleLanguage,
  ui: settings.ui,
  debugLogging: settings.debugLogging,
  isConfigured: Boolean(settings.sonarrUrl && settings.sonarrApiKey),
});

const getRawOptions = async () => {
  const [pub, secrets] = await Promise.all([publicOptions.getValue(), sonarrSecrets.getValue()]);
  return {
    ...pub,
    sonarrApiKey: secrets.apiKey,
  };
};

/**
 * Fetches the combined extension options (including secrets) for use in
 * background and options contexts.
 */
export async function getExtensionOptionsSnapshot(): Promise<Settings> {
  const raw = await getRawOptions();
  return parseSettings(raw);
}

/**
 * Persists the full extension options, splitting the public slice from secrets.
 * Exposes a single call site for writes to keep the boolean mirror in sync.
 */
export async function setExtensionOptionsSnapshot(options: ExtensionOptions): Promise<void> {
  const parsed = parseSettings(options);

  let normalizedUrl = parsed.sonarrUrl ?? '';
  if (normalizedUrl.trim() !== '') {
    const vUrl = validateUrl(normalizedUrl);
    if (!vUrl.isValid) {
      throw new Error(`Invalid Sonarr URL: ${vUrl.error ?? 'unknown'}`);
    }
    normalizedUrl = vUrl.normalizedUrl ?? normalizedUrl.trim();
  } else {
    normalizedUrl = '';
  }

  let apiKey = parsed.sonarrApiKey ?? '';
  if (apiKey.trim() !== '') {
    const k = validateApiKey(apiKey);
    if (!k.isValid) {
      throw new Error(`Invalid Sonarr API key: ${k.error ?? 'invalid format'}`);
    }
    apiKey = apiKey.trim();
  } else {
    apiKey = '';
  }

  const sanitized: Settings = {
    ...parsed,
    sonarrUrl: normalizedUrl,
    sonarrApiKey: apiKey,
  };

  await Promise.all([
    publicOptions.setValue(toPublicOptions(sanitized)),
    sonarrSecrets.setValue({ apiKey }),
  ]);
}

/**
 * Returns the current public configuration, merging in default values so
 * callers never have to defensively clone structures.
 */
export async function getPublicOptionsSnapshot(): Promise<PublicOptions> {
  const raw = await getRawOptions();
  const parsed = parseSettings(raw);
  return toPublicOptions(parsed);
}
