import type { MappingExternalId, MappingProvider } from '@/shared/types';
import type {
  MappingCandidateSuppressionEntry,
  MappingIgnoreEntry,
  MappingOverrideEntry,
} from './storage';

export type MappingRecordKey = `${MappingProvider}:${number}`;
export type ReverseLookupKey = `${MappingProvider}:${MappingExternalId['kind']}:${number}`;
export type MappingCandidateRecordKey = `${MappingProvider}:${number}:${MappingExternalId['kind']}:${number}`;

export const isFiniteId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isMappingProvider = (value: unknown): value is MappingProvider =>
  value === 'sonarr' || value === 'radarr';

export const isExternalIdKind = (value: unknown): value is MappingExternalId['kind'] =>
  value === 'tvdb' || value === 'tmdb';

export const createRecordKey = (provider: MappingProvider, anilistId: number): MappingRecordKey =>
  `${provider}:${anilistId}`;

export const parseRecordKey = (key: string): { provider: MappingProvider; anilistId: number } | null => {
  const [provider, rawAnilistId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId)) return null;
  return { provider, anilistId };
};

export const createReverseLookupKey = (provider: MappingProvider, externalId: MappingExternalId): ReverseLookupKey =>
  `${provider}:${externalId.kind}:${externalId.id}`;

export const createCandidateRecordKey = (
  provider: MappingProvider,
  anilistId: number,
  externalId: MappingExternalId,
): MappingCandidateRecordKey => `${provider}:${anilistId}:${externalId.kind}:${externalId.id}`;

export const parseCandidateRecordKey = (
  key: string,
): { provider: MappingProvider; anilistId: number; externalId: MappingExternalId } | null => {
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

export const normalizeOverrideEntry = (entry: unknown): MappingOverrideEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<MappingOverrideEntry>;
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

export const normalizeCandidateSuppressionEntry = (entry: unknown): MappingCandidateSuppressionEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<MappingCandidateSuppressionEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  const externalId = normalizeExternalId(candidate.externalId);
  if (!externalId) return null;
  return {
    provider: candidate.provider,
    externalId,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
};
