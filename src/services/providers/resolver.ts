import type { AniFormat, MediaService, PublicOptions } from '@/shared/types';

type ProviderDescriptor = {
  service: MediaService;
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

export const getProviderDescriptor = (service: MediaService): ProviderDescriptor => {
  switch (service) {
    case 'sonarr':
      return { service: 'sonarr', label: 'Sonarr' };
    case 'radarr':
      return { service: 'radarr', label: 'Radarr' };
    default:
      return assertUnreachable(service);
  }
};

export const getProviderLabel = (service: MediaService): string => getProviderDescriptor(service).label;

export const resolveProviderForAniListFormat = (format: AniFormat | null | undefined): MediaService | null => {
  if (format === 'MOVIE') return 'radarr';
  if (format === 'MUSIC') return null;
  return 'sonarr';
};

export const isProviderConfigured = (
  service: MediaService,
  options: unknown,
): boolean => {
  if (!hasProviderShape(options)) return false;
  switch (service) {
    case 'sonarr':
      return options.providers?.sonarr?.isConfigured === true;
    case 'radarr':
      return options.providers?.radarr?.isConfigured === true;
    default:
      return assertUnreachable(service);
  }
};

export const getProviderBaseUrl = (
  service: MediaService,
  options: unknown,
): string => {
  if (!hasProviderShape(options)) return '';
  switch (service) {
    case 'sonarr':
      return options.providers?.sonarr?.url ?? '';
    case 'radarr':
      return options.providers?.radarr?.url ?? '';
    default:
      return assertUnreachable(service);
  }
};
