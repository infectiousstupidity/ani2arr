/** Key helpers and normalizers for persisted manual mapping records. */
// src/mapping/manual/keys.ts

import { parseAniListIdOrNull, type AniListId } from '@/anilist';
import {
  parseTmdbIdOrNull,
  parseTvdbIdOrNull,
  type Provider,
  type ProviderIdFor,
} from '@/providers';
import type { MappingIgnoreEntry, StoredMappingProviderIdEntry } from './types';

export const isFiniteId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isMappingProvider = (value: unknown): value is Provider =>
  value === 'sonarr' || value === 'radarr';

const parseAniListIdFromKeyPart = (value: string | undefined): AniListId | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  return parseAniListIdOrNull(Number(value));
};

export const createRecordKey = (provider: Provider, anilistId: AniListId): string =>
  `${provider}:${anilistId}`;

export const parseRecordKey = (key: string): { provider: Provider; anilistId: AniListId } | null => {
  const [provider, rawAnilistId] = key.split(':');
  const anilistId = parseAniListIdFromKeyPart(rawAnilistId);
  if (!isMappingProvider(provider) || anilistId === null) return null;
  return { provider, anilistId };
};

function parseProviderTargetId(provider: 'sonarr', value: unknown): ProviderIdFor<'sonarr'> | null;
function parseProviderTargetId(provider: 'radarr', value: unknown): ProviderIdFor<'radarr'> | null;
function parseProviderTargetId(provider: Provider, value: unknown): ProviderIdFor<Provider> | null {
  return provider === 'sonarr'
    ? parseTvdbIdOrNull(value)
    : parseTmdbIdOrNull(value);
}

export const createReverseLookupKey = <P extends Provider>(
  provider: P,
  providerId: ProviderIdFor<P>,
): string =>
  `${provider}:${providerId}`;

export const createCandidateRecordKey = <P extends Provider>(
  provider: P,
  anilistId: AniListId,
  providerId: ProviderIdFor<P>,
): string => `${provider}:${anilistId}:${providerId}`;

export const parseCandidateRecordKey = (
  key: string,
): ({ provider: 'sonarr'; anilistId: AniListId; providerId: ProviderIdFor<'sonarr'> }
  | { provider: 'radarr'; anilistId: AniListId; providerId: ProviderIdFor<'radarr'> }) | null => {
  const [provider, rawAnilistId, rawProviderId] = key.split(':');
  const anilistId = parseAniListIdFromKeyPart(rawAnilistId);
  if (!isMappingProvider(provider) || anilistId === null || rawProviderId === undefined) {
    return null;
  }
  const numericProviderId = Number(rawProviderId);
  if (provider === 'sonarr') {
    const providerId = parseTvdbIdOrNull(numericProviderId);
    return providerId === null ? null : { provider, anilistId, providerId };
  }
  const providerId = parseTmdbIdOrNull(numericProviderId);
  return providerId === null ? null : { provider, anilistId, providerId };
};

export const normalizeManualMappingEntry = (entry: unknown): StoredMappingProviderIdEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<StoredMappingProviderIdEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now();
  if (candidate.provider === 'sonarr') {
    const providerId = parseProviderTargetId(candidate.provider, candidate.providerId);
    return providerId === null ? null : { provider: candidate.provider, providerId, updatedAt };
  }
  const providerId = parseProviderTargetId(candidate.provider, candidate.providerId);
  return providerId === null ? null : { provider: candidate.provider, providerId, updatedAt };
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
  const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now();
  if (candidate.provider === 'sonarr') {
    const providerId = parseProviderTargetId(candidate.provider, candidate.providerId);
    return providerId === null ? null : { provider: candidate.provider, providerId, updatedAt };
  }
  const providerId = parseProviderTargetId(candidate.provider, candidate.providerId);
  return providerId === null ? null : { provider: candidate.provider, providerId, updatedAt };
};
