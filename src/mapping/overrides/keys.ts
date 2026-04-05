/** Key helpers and normalizers for persisted mapping override records. */
// src/mapping/overrides/keys.ts

import type { Provider } from '@/providers';
import type { MappingIgnoreEntry, StoredMappingProviderIdEntry } from './types';

export const isFiniteId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isMappingProvider = (value: unknown): value is Provider =>
  value === 'sonarr' || value === 'radarr';

export const createRecordKey = (provider: Provider, anilistId: number): string =>
  `${provider}:${anilistId}`;

export const parseRecordKey = (key: string): { provider: Provider; anilistId: number } | null => {
  const [provider, rawAnilistId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId)) return null;
  return { provider, anilistId };
};

export const createReverseLookupKey = (provider: Provider, providerId: number): string =>
  `${provider}:${providerId}`;

export const createCandidateRecordKey = (
  provider: Provider,
  anilistId: number,
  providerId: number,
): string => `${provider}:${anilistId}:${providerId}`;

export const parseCandidateRecordKey = (
  key: string,
): { provider: Provider; anilistId: number; providerId: number } | null => {
  const [provider, rawAnilistId, rawProviderId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  const providerId = Number(rawProviderId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId) || !isFiniteId(providerId)) {
    return null;
  }
  return { provider, anilistId, providerId };
};

export const normalizeOverrideEntry = (entry: unknown): StoredMappingProviderIdEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<StoredMappingProviderIdEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  if (!isFiniteId(candidate.providerId)) return null;
  return {
    provider: candidate.provider,
    providerId: candidate.providerId,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
};

export const normalizeIgnoreEntry = (entry: unknown): MappingIgnoreEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<MappingIgnoreEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  return {
    provider: candidate.provider,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
};

export const normalizeCandidateSuppressionEntry = (entry: unknown): StoredMappingProviderIdEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<StoredMappingProviderIdEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  if (!isFiniteId(candidate.providerId)) return null;
  return {
    provider: candidate.provider,
    providerId: candidate.providerId,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
};
