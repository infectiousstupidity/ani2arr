/** Authoritative persistence for user-authored mapping decisions such as manual mappings, ignored mappings, and rejected candidates. */
// src/mapping/manual/manual-mapping.storage.ts

import { storage } from '@wxt-dev/storage';
import type { StoredProviderMappingEntry, StoredMappingIgnoreEntry } from '@/mapping/manual/types';
import { PersistedMap } from '@/mapping/manual/persisted-map';
import {
  normalizeCandidateSuppressionEntry,
  normalizeIgnoreEntry,
  normalizeManualMappingEntry,
  parseCandidateRecordKey,
  parseRecordKey,
} from './keys';
import type { AniListId } from '@/anilist';
import type { Provider, TmdbId, TvdbId } from '@/providers';

const MANUAL_MAPPINGS_STORAGE_KEY = 'local:manualMappings';
const IGNORED_MANUAL_MAPPINGS_STORAGE_KEY = 'local:ignoredManualMappings';
const MAPPING_REJECTED_CANDIDATES_STORAGE_KEY = 'local:rejectedMappingCandidates';

const toBrowserStorageChangeKey = (storageKey: string): string =>
  storageKey.replace(/^local:/, '');

export const MANUAL_MAPPINGS_CHANGE_KEY = toBrowserStorageChangeKey(MANUAL_MAPPINGS_STORAGE_KEY);
export const IGNORED_MANUAL_MAPPINGS_CHANGE_KEY = toBrowserStorageChangeKey(IGNORED_MANUAL_MAPPINGS_STORAGE_KEY);
export const MAPPING_REJECTED_CANDIDATES_CHANGE_KEY = toBrowserStorageChangeKey(MAPPING_REJECTED_CANDIDATES_STORAGE_KEY);

type ParsedRecordKey = { provider: Provider; anilistId: AniListId };
type ParsedCandidateKey =
  | { provider: 'sonarr'; anilistId: AniListId; providerId: TvdbId }
  | { provider: 'radarr'; anilistId: AniListId; providerId: TmdbId };

const manualMappingsStorage = storage.defineItem<Record<string, StoredProviderMappingEntry>>(MANUAL_MAPPINGS_STORAGE_KEY, {
  fallback: {},
  version: 2,
});

const ignoredManualMappingsStorage = storage.defineItem<Record<string, StoredMappingIgnoreEntry>>(IGNORED_MANUAL_MAPPINGS_STORAGE_KEY, {
  fallback: {},
  version: 2,
});

const mappingRejectedCandidatesStorage = storage.defineItem<Record<string, StoredProviderMappingEntry>>(
  MAPPING_REJECTED_CANDIDATES_STORAGE_KEY,
  { fallback: {}, version: 2 },
);

export function createManualMappingPersistedMaps() {
  return {
    manualMappings: new PersistedMap<string, StoredProviderMappingEntry, ParsedRecordKey>({
      storage: manualMappingsStorage,
      parseKey: parseRecordKey,
      normalize: normalizeManualMappingEntry,
      storageChangeKeys: [MANUAL_MAPPINGS_CHANGE_KEY],
    }),
    ignoredMappings: new PersistedMap<string, StoredMappingIgnoreEntry, ParsedRecordKey>({
      storage: ignoredManualMappingsStorage,
      parseKey: parseRecordKey,
      normalize: normalizeIgnoreEntry,
      storageChangeKeys: [IGNORED_MANUAL_MAPPINGS_CHANGE_KEY],
    }),
    rejectedCandidates: new PersistedMap<string, StoredProviderMappingEntry, ParsedCandidateKey>({
      storage: mappingRejectedCandidatesStorage,
      parseKey: parseCandidateRecordKey,
      normalize: normalizeCandidateSuppressionEntry,
      storageChangeKeys: [MAPPING_REJECTED_CANDIDATES_CHANGE_KEY],
    }),
  };
}
