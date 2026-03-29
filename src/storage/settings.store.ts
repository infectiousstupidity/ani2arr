/** Authoritative persistence for extension settings, public options, and provider secrets. */
// src/storage/settings.store.ts

import { storage } from '@wxt-dev/storage';
import * as v from 'valibot';
import { SettingsSchema, createDefaultSettings } from '@/shared/schemas/settings';
import {
  validateProviderConnectionApiKey,
  validateProviderConnectionUrl,
} from '@/shared/schemas/providers/provider-connection.schema';
import type { Settings } from '@/shared/schemas/settings';
import type { ExtensionOptions, PublicOptions } from '@/shared/types';
import { logger } from '@/shared/utils/logger';
import { STORAGE_KEYS } from './keys';

type SonarrSecrets = { apiKey: string };
type RadarrSecrets = { apiKey: string };

const createDefaultSonarrSecrets = (): SonarrSecrets => ({ apiKey: '' });
const createDefaultRadarrSecrets = (): RadarrSecrets => ({ apiKey: '' });

export function toPublicOptions(settings: ExtensionOptions): PublicOptions {
  return {
    providers: {
      sonarr: {
        url: settings.providers.sonarr.url,
        preferredAniListTitleLanguage: settings.providers.sonarr.preferredAniListTitleLanguage,
        defaults: settings.providers.sonarr.defaults,
        isConfigured: Boolean(settings.providers.sonarr.url && settings.providers.sonarr.apiKey),
      },
      radarr: {
        url: settings.providers.radarr.url,
        preferredAniListTitleLanguage: settings.providers.radarr.preferredAniListTitleLanguage,
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
): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  const result = validateProviderConnectionUrl(trimmed);
  if (!result.ok) {
    throw new Error(`Invalid ${label} URL: ${result.error}`);
  }

  return result.value;
}

function normalizeApiKey(
  value: string | undefined,
  label: string,
): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  const result = validateProviderConnectionApiKey(trimmed);
  if (!result.ok) {
    throw new Error(`Invalid ${label} API key: ${result.error}`);
  }

  return result.value;
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

  const sonarrUrl = normalizeUrl(parsed.providers.sonarr.url, 'Sonarr');
  const sonarrApiKey = normalizeApiKey(parsed.providers.sonarr.apiKey, 'Sonarr');

  const radarrUrl = normalizeUrl(parsed.providers.radarr.url, 'Radarr');
  const radarrApiKey = normalizeApiKey(parsed.providers.radarr.apiKey, 'Radarr');

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
