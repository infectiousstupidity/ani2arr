import type { StaticMappingPayload } from '@/services/mapping.service';

export const primaryMappingUrl =
  'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json';
export const fallbackMappingUrl =
  'https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json';

export const createStaticMappingPayload = (
  pairs: Record<number, number> = { 12345: 987654 },
): StaticMappingPayload => ({
  pairs,
});

export type MappingFixtureOptions = {
  etag?: string;
  retryAfterSeconds?: number;
};

export const createMappingHeaders = (
  options: MappingFixtureOptions = {},
): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.etag) {
    headers.ETag = options.etag;
  }
  if (options.retryAfterSeconds !== undefined) {
    headers['Retry-After'] = options.retryAfterSeconds.toString();
  }
  return headers;
};
