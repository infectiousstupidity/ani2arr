import type { CheckSeriesStatusPayload, MappingProvider, MediaMetadataHint } from '@/shared/types';
import type { GetMappingsInput } from '@/rpc/schemas';

const rootQueryKey = ['a2a'] as const;

// Normalize strings to ensure "Show Name" and "show name " hit the same cache
const normalizeTitleKey = (title?: string) => {
  const trimmed = title?.trim();
  return trimmed ? trimmed.toLowerCase() : '::';
};

// Create a deterministic subset of metadata for cache stability.
// This prevents cache misses caused by:
// 1. Reference instability (new objects with same content)
// 2. undefined vs null inconsistencies
// 3. Unstable array ordering (prequel IDs)
// 4. Irrelevant fields (coverImage, etc.)
const getStableMetadata = (metadata?: MediaMetadataHint | null) => {
  if (!metadata) return null;
  return {
    titles: {
      english: metadata.titles?.english?.trim() || null,
      romaji: metadata.titles?.romaji?.trim() || null,
      native: metadata.titles?.native?.trim() || null,
    },
    startYear: metadata.startYear ?? null,
    format: metadata.format ?? null,
    // Limit synonyms to 5 to match backend matching logic and reduce cache fragmentation
    synonyms: (metadata.synonyms || []).slice(0, 5),
    // Sort numeric IDs to ensure array order doesn't affect cache identity
    relationPrequelIds: (metadata.relationPrequelIds || []).slice().sort((a, b) => a - b),
  };
};

const seriesStatusRootKey = (provider: MappingProvider) => [...rootQueryKey, 'seriesStatus', provider] as const;

const seriesStatusBaseKey = (provider: MappingProvider, anilistId: number) =>
  [...seriesStatusRootKey(provider), anilistId] as const;

const providerMetadataRootKey = (provider: MappingProvider) =>
  [...rootQueryKey, `${provider}Metadata`] as const;

const normalizeMappingsInput = (input?: GetMappingsInput) => {
  if (!input) return 'default';
  const normalized: Record<string, unknown> = {};
  if (input.sources?.length) {
    normalized.sources = Array.from(new Set(input.sources)).sort();
  }
  if (input.providers?.length) {
    normalized.providers = Array.from(new Set(input.providers)).sort();
  }
  if (typeof input.limit === 'number') {
    normalized.limit = input.limit;
  }
  if (input.query && input.query.trim()) {
    normalized.query = input.query.trim().toLowerCase();
  }
  if (input.cursor) {
    normalized.cursor = {
      updatedAt: input.cursor.updatedAt,
      anilistId: input.cursor.anilistId,
      provider: input.cursor.provider,
    };
  }
  return normalized;
};

export const normalizeMetadataIds = (ids: number[]) => {
  const unique = Array.from(new Set(ids.filter(id => Number.isFinite(id) && id > 0))) as number[];
  unique.sort((a, b) => a - b);
  return unique;
};

export const queryKeys = {
  all: rootQueryKey,
  options: () => [...rootQueryKey, 'options'] as const,
  publicOptions: () => [...rootQueryKey, 'publicOptions'] as const,
  aniListMedia: (anilistId: number) => [...rootQueryKey, 'aniListMedia', anilistId] as const,
  seriesStatusRoot: (provider: MappingProvider = 'sonarr') => seriesStatusRootKey(provider),
  seriesStatusBase: (anilistId: number, provider: MappingProvider = 'sonarr') =>
    seriesStatusBaseKey(provider, anilistId),
  seriesStatus: (payload: CheckSeriesStatusPayload, provider: MappingProvider = 'sonarr') =>
    [
      ...seriesStatusBaseKey(provider, payload.anilistId),
      {
        // TanStack Query hashes this object. By using normalized inputs,
        // we ensure cache hits across different contexts (e.g. Card vs Page).
        title: normalizeTitleKey(payload.title),
        metadata: getStableMetadata(payload.metadata),
      },
    ] as const,
  sonarrMetadataRoot: () => providerMetadataRootKey('sonarr'),
  sonarrMetadata: (scope?: string) => [...rootQueryKey, 'sonarrMetadata', scope ?? 'configured'] as const,
  radarrMetadataRoot: () => providerMetadataRootKey('radarr'),
  radarrMetadata: (scope?: string) => [...rootQueryKey, 'radarrMetadata', scope ?? 'configured'] as const,
  mappingSearch: (service: 'sonarr' | 'radarr', query: string) =>
    [...rootQueryKey, 'mappingSearch', service, query.trim().toLowerCase()] as const,
  mappingOverridesRoot: () => [...rootQueryKey, 'mappingOverrides'] as const,
  mappingOverrides: (provider: MappingProvider | 'all' = 'all') =>
    [...rootQueryKey, 'mappingOverrides', provider] as const,
  mappingsRoot: () => [...rootQueryKey, 'mappings'] as const,
  mappings: (input?: GetMappingsInput) => [...rootQueryKey, 'mappings', normalizeMappingsInput(input)] as const,
  aniListMetadata: (ids: number[]) => [...rootQueryKey, 'aniListMetadata', normalizeMetadataIds(ids)] as const,
};
