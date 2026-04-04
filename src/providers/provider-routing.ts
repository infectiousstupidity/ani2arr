/** Provider labels, routing, and option lookups for supported providers. */
// src/providers/provider-routing.ts

import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';
import type { PublicOptions } from '@/options';
import type { Provider } from './types';

type ProviderDescriptor = {
  service: Provider;
  label: string;
};

const assertUnreachable = (value: never): never => {
  throw new Error(`Unsupported media service: ${String(value)}`);
};

const hasProviderShape = (
  options: unknown,
): options is Pick<PublicOptions, 'providers'> => {
  if (!options || typeof options !== 'object') return false;
  const maybeProviders = (options as { providers?: unknown }).providers;
  return Boolean(maybeProviders && typeof maybeProviders === 'object');
};

export const getProviderDescriptor = (service: Provider): ProviderDescriptor => {
  switch (service) {
    case 'sonarr': {
      return { service: 'sonarr', label: 'Sonarr' };
    }
    case 'radarr': {
      return { service: 'radarr', label: 'Radarr' };
    }
    default: {
      return assertUnreachable(service);
    }
  }
};

export const getProviderLabel = (service: Provider): string => getProviderDescriptor(service).label;

export const resolveProviderForAniListFormat = (format: AniListMediaFormat | null | undefined): Provider | null => {
  switch (format) {
    case 'MOVIE': {
      return 'radarr';
    }
    case 'TV':
    case 'TV_SHORT':
    case 'SPECIAL':
    case 'OVA':
    case 'ONA': {
      return 'sonarr';
    }
    case 'MUSIC':
    case 'MANGA':
    case 'NOVEL':
    case 'ONE_SHOT':
    case null:
    case undefined: {
      return null;
    }
    default: {
      return null;
    }
  }
};

export const isProviderConfigured = (
  service: Provider,
  options: unknown,
): boolean => {
  if (!hasProviderShape(options)) return false;
  switch (service) {
    case 'sonarr': {
      return options.providers?.sonarr?.isConfigured === true;
    }
    case 'radarr': {
      return options.providers?.radarr?.isConfigured === true;
    }
    default: {
      return assertUnreachable(service);
    }
  }
};

export const getProviderBaseUrl = (
  service: Provider,
  options: unknown,
): string => {
  if (!hasProviderShape(options)) return '';
  switch (service) {
    case 'sonarr': {
      return options.providers?.sonarr?.url ?? '';
    }
    case 'radarr': {
      return options.providers?.radarr?.url ?? '';
    }
    default: {
      return assertUnreachable(service);
    }
  }
};
