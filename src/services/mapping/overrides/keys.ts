/** Key helpers and normalizers for persisted mapping override records. */
// src/services/mapping/overrides/keys.ts

import type { MappingExternalId } from '@/services/mapping/types';
import type { Provider } from '@/integrations/providers';
import type { MappingIgnoreEntry, StoredMappingExternalIdEntry } from './types';

export const isFiniteId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isMappingProvider = (value: unknown): value is Provider =>
  value === 'sonarr' || value === 'radarr';

export const isExternalIdKind = (value: unknown): value is MappingExternalId['kind'] =>
  value === 'tvdb' || value === 'tmdb';

export const createRecordKey = (provider: Provider, anilistId: number): string =>
  `${provider}:${anilistId}`;

export const parseRecordKey = (key: string): { provider: Provider; anilistId: number } | null => {
  const [provider, rawAnilistId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId)) return null;
  return { provider, anilistId };
};

export const createReverseLookupKey = (provider: Provider, externalId: MappingExternalId): string =>
  `${provider}:${externalId.kind}:${externalId.id}`;

export const createCandidateRecordKey = (
  provider: Provider,
  anilistId: number,
  externalId: MappingExternalId,
): string => `${provider}:${anilistId}:${externalId.kind}:${externalId.id}`;

export const parseCandidateRecordKey = (
  key: string,
): { provider: Provider; anilistId: number; externalId: MappingExternalId } | null => {
  const [provider, rawAnilistId, kind, rawExternalId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  const externalId = Number(rawExternalId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId) || !isFiniteId(externalId) || !isExternalIdKind(kind)) {
    return null;
  }
  return { provider, anilistId, externalId: { id: externalId, kind } };
};

export const normalizeExternalId = (externalId: unknown): MappingExternalId | null => {
  if (!externalId || typeof externalId !== 'object') return null;
  const candidate = externalId as Partial<MappingExternalId>;
  if (!isFiniteId(candidate.id) || !isExternalIdKind(candidate.kind)) return null;
  return { id: candidate.id, kind: candidate.kind };
};

export const normalizeOverrideEntry = (entry: unknown): StoredMappingExternalIdEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<StoredMappingExternalIdEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  const externalId = normalizeExternalId(candidate.externalId);
  if (!externalId) return null;
  return {
    provider: candidate.provider,
    externalId,
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

export const normalizeCandidateSuppressionEntry = (entry: unknown): StoredMappingExternalIdEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<StoredMappingExternalIdEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  const externalId = normalizeExternalId(candidate.externalId);
  if (!externalId) return null;
  return {
    provider: candidate.provider,
    externalId,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
};
