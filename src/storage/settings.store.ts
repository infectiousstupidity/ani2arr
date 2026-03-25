/** Authoritative persistence for extension settings, public options, and provider secrets. */
// src/lib/storage/settings.store.ts

import { storage } from '@wxt-dev/storage';
import * as v from 'valibot';
import { SettingsSchema, createDefaultSettings } from '@/shared/schemas/settings';
import type { Settings } from '@/shared/schemas/settings';
import type {
  ExtensionOptions,
  PublicOptions,
  RadarrSecrets,
  SonarrSecrets,
} from '@/shared/types';
import {
  validateApiKey as validateRadarrApiKey,
  validateUrl as validateRadarrUrl,
} from '@/shared/providers/radarr/validation';
import { validateUrl as validateSonarrUrl, validateApiKey as validateSonarrApiKey } from '@/shared/providers/sonarr/validation';
import { logger } from '@/shared/utils/logger';
import { STORAGE_KEYS } from './keys';

const createDefaultSonarrSecrets = (): SonarrSecrets => ({ apiKey: '' });
const createDefaultRadarrSecrets = (): RadarrSecrets => ({ apiKey: '' });

export function toPublicOptions(settings: ExtensionOptions): PublicOptions {
  return {
    providers: {
      sonarr: {
        url: settings.providers.sonarr.url,
        providerTitleLanguage: settings.providers.sonarr.providerTitleLanguage,
        defaults: settings.providers.sonarr.defaults,
        isConfigured: Boolean(settings.providers.sonarr.url && settings.providers.sonarr.apiKey),
      },
      radarr: {
        url: settings.providers.radarr.url,
        providerTitleLanguage: settings.providers.radarr.providerTitleLanguage,
        defaults: settings.providers.radarr.defaults,
        isConfigured: Boolean(settings.providers.radarr.url && settings.providers.radarr.apiKey),
      },
    },
    ui: settings.ui,
    debugLogging: settings.debugLogging,
  };
}

function createDefaultPublicOptions(): PublicOptions {
  return toPublicOptions(createDefaultSettings());
}

export const publicOptions = storage.defineItem<PublicOptions>(STORAGE_KEYS.publicOptions, {
  fallback: createDefaultPublicOptions(),
  version: 1,
});

export const sonarrSecrets = storage.defineItem<SonarrSecrets>(STORAGE_KEYS.sonarrSecrets, {
  fallback: createDefaultSonarrSecrets(),
  version: 1,
});

export const radarrSecrets = storage.defineItem<RadarrSecrets>(STORAGE_KEYS.radarrSecrets, {
  fallback: createDefaultRadarrSecrets(),
  version: 1,
});

export const parseSettings = (raw: unknown): Settings => {
  const result = v.safeParse(SettingsSchema, raw);
  if (result.success) return result.output;
  logger.warn('Storage mismatch, applying defaults', result.issues);
  return v.parse(SettingsSchema, raw ?? {});
};

function normalizeUrl(
  value: string | undefined,
  label: string,
  validate: (value: string) => { isValid: boolean; error?: string; normalizedUrl?: string },
): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  const result = validate(trimmed);
  if (!result.isValid) {
    throw new Error(`Invalid ${label} URL: ${result.error ?? 'unknown'}`);
  }

  return result.normalizedUrl ?? trimmed;
}

function normalizeApiKey(
  value: string | undefined,
  label: string,
  validate: (value: string) => { isValid: boolean; error?: string },
): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  const result = validate(trimmed);
  if (!result.isValid) {
    throw new Error(`Invalid ${label} API key: ${result.error ?? 'invalid format'}`);
  }

  return trimmed;
}

const getRawOptions = async () => {
  const [pub, sonarr, radarr] = await Promise.all([
    publicOptions.getValue(),
    sonarrSecrets.getValue(),
    radarrSecrets.getValue(),
  ]);

  return {
    providers: {
      sonarr: {
        ...(pub.providers?.sonarr ?? {}),
        apiKey: sonarr.apiKey,
      },
      radarr: {
        ...(pub.providers?.radarr ?? {}),
        apiKey: radarr.apiKey,
      },
    },
    ui: pub.ui,
    debugLogging: pub.debugLogging,
  };
};

export async function getExtensionOptionsSnapshot(): Promise<Settings> {
  return parseSettings(await getRawOptions());
}

export async function setExtensionOptionsSnapshot(options: ExtensionOptions): Promise<void> {
  const parsed = parseSettings(options);

  const sonarrUrl = normalizeUrl(parsed.providers.sonarr.url, 'Sonarr', validateSonarrUrl);
  const sonarrApiKey = normalizeApiKey(parsed.providers.sonarr.apiKey, 'Sonarr', validateSonarrApiKey);

  const radarrUrl = normalizeUrl(parsed.providers.radarr.url, 'Radarr', validateRadarrUrl);
  const radarrApiKey = normalizeApiKey(parsed.providers.radarr.apiKey, 'Radarr', validateRadarrApiKey);

  const sanitized: Settings = {
    ...parsed,
    providers: {
      sonarr: {
        ...parsed.providers.sonarr,
        url: sonarrUrl,
        apiKey: sonarrApiKey,
      },
      radarr: {
        ...parsed.providers.radarr,
        url: radarrUrl,
        apiKey: radarrApiKey,
      },
    },
  };

  await Promise.all([
    publicOptions.setValue(toPublicOptions(sanitized)),
    sonarrSecrets.setValue({ apiKey: sonarrApiKey }),
    radarrSecrets.setValue({ apiKey: radarrApiKey }),
  ]);
}

export async function getPublicOptionsSnapshot(): Promise<PublicOptions> {
  return toPublicOptions(parseSettings(await getRawOptions()));
}
