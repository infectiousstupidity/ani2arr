// src/shared/options/storage.ts

/**
 * @file Defines and exports user-configurable extension settings.
 * Public-facing configuration is stored separately from sensitive
 * Sonarr credentials so that content scripts never touch the API key.
 */
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
import { validateApiKey as validateRadarrApiKey, validateUrl as validateRadarrUrl } from '@/shared/radarr/validation';
import { validateUrl, validateApiKey } from '@/shared/sonarr/validation';
import { logger } from '@/shared/utils/logger';

const createDefaultSecrets = (): SonarrSecrets => ({
  apiKey: '',
});

const createDefaultRadarrSecrets = (): RadarrSecrets => ({
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

export const radarrSecrets = storage.defineItem<RadarrSecrets>('local:radarrSecrets', {
  fallback: createDefaultRadarrSecrets(),
  version: 1,
});

export const parseSettings = (raw: unknown): Settings => {
  const result = v.safeParse(SettingsSchema, raw);
  if (result.success) return result.output;
  logger.warn('Storage mismatch, applying defaults', result.issues);
  return v.parse(SettingsSchema, raw ?? {});
};

export function toPublicOptions(settings: ExtensionOptions): PublicOptions {
  return {
    providers: {
      sonarr: {
        url: settings.providers.sonarr.url,
        defaults: settings.providers.sonarr.defaults,
        isConfigured: Boolean(settings.providers.sonarr.url && settings.providers.sonarr.apiKey),
      },
      radarr: {
        url: settings.providers.radarr.url,
        defaults: settings.providers.radarr.defaults,
        isConfigured: Boolean(settings.providers.radarr.url && settings.providers.radarr.apiKey),
      },
    },
    titleLanguage: settings.titleLanguage,
    ui: settings.ui,
    debugLogging: settings.debugLogging,
  };
}

function createDefaultPublicOptions(): PublicOptions {
  return toPublicOptions(createDefaultSettings());
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
    titleLanguage: pub.titleLanguage,
    ui: pub.ui,
    debugLogging: pub.debugLogging,
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

  let sonarrUrl = parsed.providers.sonarr.url ?? '';
  if (sonarrUrl.trim() !== '') {
    const vUrl = validateUrl(sonarrUrl);
    if (!vUrl.isValid) {
      throw new Error(`Invalid Sonarr URL: ${vUrl.error ?? 'unknown'}`);
    }
    sonarrUrl = vUrl.normalizedUrl ?? sonarrUrl.trim();
  } else {
    sonarrUrl = '';
  }

  let sonarrApiKey = parsed.providers.sonarr.apiKey ?? '';
  if (sonarrApiKey.trim() !== '') {
    const k = validateApiKey(sonarrApiKey);
    if (!k.isValid) {
      throw new Error(`Invalid Sonarr API key: ${k.error ?? 'invalid format'}`);
    }
    sonarrApiKey = sonarrApiKey.trim();
  } else {
    sonarrApiKey = '';
  }

  let radarrUrl = parsed.providers.radarr.url ?? '';
  if (radarrUrl.trim() !== '') {
    const vUrl = validateRadarrUrl(radarrUrl);
    if (!vUrl.isValid) {
      throw new Error(`Invalid Radarr URL: ${vUrl.error ?? 'unknown'}`);
    }
    radarrUrl = vUrl.normalizedUrl ?? radarrUrl.trim();
  } else {
    radarrUrl = '';
  }

  let radarrApiKey = parsed.providers.radarr.apiKey ?? '';
  if (radarrApiKey.trim() !== '') {
    const k = validateRadarrApiKey(radarrApiKey);
    if (!k.isValid) {
      throw new Error(`Invalid Radarr API key: ${k.error ?? 'invalid format'}`);
    }
    radarrApiKey = radarrApiKey.trim();
  } else {
    radarrApiKey = '';
  }

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

/**
 * Returns the current public configuration, merging in default values so
 * callers never have to defensively clone structures.
 */
export async function getPublicOptionsSnapshot(): Promise<PublicOptions> {
  const raw = await getRawOptions();
  const parsed = parseSettings(raw);
  return toPublicOptions(parsed);
}
