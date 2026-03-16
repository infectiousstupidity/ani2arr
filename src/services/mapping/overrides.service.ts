// src/services/mapping/overrides.service.ts
import { browser } from 'wxt/browser';
import {
  mappingBlockedCandidatesLocal,
  mappingBlockedCandidatesSync,
  mappingIgnoresLocal,
  mappingIgnoresSync,
  mappingRejectedCandidatesLocal,
  mappingRejectedCandidatesSync,
  mappingOverridesLocal,
  mappingOverridesSync,
  type MappingCandidateSuppressionEntry,
  type MappingCandidateSuppressionMap,
  type MappingIgnoreMap,
  type MappingIgnoreEntry,
  type MappingOverrideMap,
  type MappingOverrideEntry,
} from '@/services/mapping/overrides-storage';
import type {
  MappingBlockedRecord,
  MappingExternalId,
  MappingIgnoreRecord,
  MappingOverrideRecord,
  MappingProvider,
  MappingRejectedRecord,
} from '@/shared/types';

type MappingRecordKey = `${MappingProvider}:${number}`;
type ReverseLookupKey = `${MappingProvider}:${MappingExternalId['kind']}:${number}`;
type MappingCandidateRecordKey = `${MappingProvider}:${number}:${MappingExternalId['kind']}:${number}`;

const isFiniteId = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isMappingProvider = (value: unknown): value is MappingProvider => value === 'sonarr' || value === 'radarr';

const isExternalIdKind = (value: unknown): value is MappingExternalId['kind'] => value === 'tvdb' || value === 'tmdb';

const createRecordKey = (provider: MappingProvider, anilistId: number): MappingRecordKey =>
  `${provider}:${anilistId}`;

const parseRecordKey = (key: string): { provider: MappingProvider; anilistId: number } | null => {
  const [provider, rawAnilistId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId)) return null;
  return { provider, anilistId };
};

const createReverseLookupKey = (provider: MappingProvider, externalId: MappingExternalId): ReverseLookupKey =>
  `${provider}:${externalId.kind}:${externalId.id}`;

const createCandidateRecordKey = (provider: MappingProvider, anilistId: number, externalId: MappingExternalId): MappingCandidateRecordKey =>
  `${provider}:${anilistId}:${externalId.kind}:${externalId.id}`;

const parseCandidateRecordKey = (
  key: string,
): { provider: MappingProvider; anilistId: number; externalId: MappingExternalId } | null => {
  const [provider, rawAnilistId, kind, rawExternalId] = key.split(':');
  const anilistId = Number(rawAnilistId);
  const externalId = Number(rawExternalId);
  if (!isMappingProvider(provider) || !isFiniteId(anilistId) || !isFiniteId(externalId) || !isExternalIdKind(kind)) {
    return null;
  }
  return {
    provider,
    anilistId,
    externalId: { id: externalId, kind },
  };
};

const normalizeExternalId = (externalId: unknown): MappingExternalId | null => {
  if (!externalId || typeof externalId !== 'object') return null;
  const candidate = externalId as Partial<MappingExternalId>;
  if (!isFiniteId(candidate.id) || !isExternalIdKind(candidate.kind)) return null;
  return { id: candidate.id, kind: candidate.kind };
};

const normalizeOverrideEntry = (entry: unknown): MappingOverrideEntry | null => {
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

const normalizeIgnoreEntry = (entry: unknown): MappingIgnoreEntry | null => {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<MappingIgnoreEntry>;
  if (!isMappingProvider(candidate.provider)) return null;
  return {
    provider: candidate.provider,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
};

const normalizeCandidateSuppressionEntry = (entry: unknown): MappingCandidateSuppressionEntry | null => {
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

export class MappingOverridesService {
  private readonly map = new Map<MappingRecordKey, MappingOverrideEntry>();
  private readonly reverse = new Map<ReverseLookupKey, Set<number>>();
  private readonly ignored = new Map<MappingRecordKey, MappingIgnoreEntry>();
  private readonly rejectedCandidates = new Map<MappingCandidateRecordKey, MappingCandidateSuppressionEntry>();
  private readonly blockedCandidates = new Map<MappingCandidateRecordKey, MappingCandidateSuppressionEntry>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    const [
      syncOverrides,
      localOverrides,
      syncIgnores,
      localIgnores,
      syncRejectedCandidates,
      localRejectedCandidates,
      syncBlockedCandidates,
      localBlockedCandidates,
    ] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
      mappingRejectedCandidatesSync.getValue(),
      mappingRejectedCandidatesLocal.getValue(),
      mappingBlockedCandidatesSync.getValue(),
      mappingBlockedCandidatesLocal.getValue(),
    ]);
    this.rebuildOverridesFromRecords(syncOverrides, localOverrides);
    this.rebuildIgnoresFromRecords(syncIgnores, localIgnores);
    this.rebuildRejectedCandidatesFromRecords(syncRejectedCandidates, localRejectedCandidates);
    this.rebuildBlockedCandidatesFromRecords(syncBlockedCandidates, localBlockedCandidates);
    this.attachWatchers();
    this.initialized = true;
  }

  public get(provider: MappingProvider, anilistId: number): MappingExternalId | null {
    const entry = this.map.get(createRecordKey(provider, anilistId));
    return entry ? entry.externalId : null;
  }

  public isIgnored(provider: MappingProvider, anilistId: number): boolean {
    return this.ignored.has(createRecordKey(provider, anilistId));
  }

  public getCandidateSuppression(
    provider: MappingProvider,
    anilistId: number,
    externalId: MappingExternalId,
  ): 'blocked' | 'rejected' | null {
    const key = createCandidateRecordKey(provider, anilistId, externalId);
    if (this.blockedCandidates.has(key)) return 'blocked';
    if (this.rejectedCandidates.has(key)) return 'rejected';
    return null;
  }

  public getLinkedAniListIds(provider: MappingProvider, externalId: MappingExternalId): number[] {
    if (!isFiniteId(externalId.id)) return [];
    const bucket = this.reverse.get(createReverseLookupKey(provider, externalId));
    if (!bucket) return [];
    return Array.from(bucket);
  }

  public has(provider: MappingProvider, anilistId: number): boolean {
    return this.map.has(createRecordKey(provider, anilistId));
  }

  public async set(provider: MappingProvider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    const updatedAt = Date.now();
    const key = createRecordKey(provider, anilistId);
    const entry: MappingOverrideEntry = { provider, externalId, updatedAt };
    const prev = this.map.get(key);
    if (prev) {
      this.removeReverse(prev.provider, prev.externalId, anilistId);
    }

    const [
      syncOverrides,
      localOverrides,
      syncIgnores,
      localIgnores,
      syncRejectedCandidates,
      localRejectedCandidates,
      syncBlockedCandidates,
      localBlockedCandidates,
    ] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
      mappingRejectedCandidatesSync.getValue(),
      mappingRejectedCandidatesLocal.getValue(),
      mappingBlockedCandidatesSync.getValue(),
      mappingBlockedCandidatesLocal.getValue(),
    ]);

    if (this.ignored.has(key)) {
      this.ignored.delete(key);
    }
    if (key in syncIgnores) delete syncIgnores[key];
    if (key in localIgnores) delete localIgnores[key];

    const candidateKey = createCandidateRecordKey(provider, anilistId, externalId);
    this.rejectedCandidates.delete(candidateKey);
    this.blockedCandidates.delete(candidateKey);
    if (candidateKey in syncRejectedCandidates) delete syncRejectedCandidates[candidateKey];
    if (candidateKey in localRejectedCandidates) delete localRejectedCandidates[candidateKey];
    if (candidateKey in syncBlockedCandidates) delete syncBlockedCandidates[candidateKey];
    if (candidateKey in localBlockedCandidates) delete localBlockedCandidates[candidateKey];

    this.map.set(key, entry);
    this.addReverse(provider, externalId, anilistId);

    const nextSync = { ...syncOverrides, [key]: entry };
    const nextLocal = { ...localOverrides, [key]: entry };
    await Promise.all([
      mappingOverridesSync.setValue(nextSync),
      mappingOverridesLocal.setValue(nextLocal),
      mappingIgnoresSync.setValue(syncIgnores),
      mappingIgnoresLocal.setValue(localIgnores),
      mappingRejectedCandidatesSync.setValue(syncRejectedCandidates),
      mappingRejectedCandidatesLocal.setValue(localRejectedCandidates),
      mappingBlockedCandidatesSync.setValue(syncBlockedCandidates),
      mappingBlockedCandidatesLocal.setValue(localBlockedCandidates),
    ]);
  }

  public async clear(provider: MappingProvider, anilistId: number): Promise<void> {
    const key = createRecordKey(provider, anilistId);
    const prev = this.map.get(key);
    if (prev) {
      this.removeReverse(prev.provider, prev.externalId, anilistId);
    }
    this.map.delete(key);
    const [sync, local] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
    ]);
    if (key in sync) delete sync[key];
    if (key in local) delete local[key];
    await Promise.all([
      mappingOverridesSync.setValue(sync),
      mappingOverridesLocal.setValue(local),
    ]);
  }

  public async setIgnore(provider: MappingProvider, anilistId: number): Promise<void> {
    const key = createRecordKey(provider, anilistId);
    const updatedAt = Date.now();

    const [syncOverrides, localOverrides, syncIgnores, localIgnores] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
    ]);

    const override = this.map.get(key);
    if (override) {
      this.removeReverse(override.provider, override.externalId, anilistId);
      this.map.delete(key);
      if (key in syncOverrides) delete syncOverrides[key];
      if (key in localOverrides) delete localOverrides[key];
    }

    const ignoreEntry: MappingIgnoreEntry = { provider, updatedAt };
    this.ignored.set(key, ignoreEntry);

    const nextSyncIgnores = { ...syncIgnores, [key]: ignoreEntry };
    const nextLocalIgnores = { ...localIgnores, [key]: ignoreEntry };

    await Promise.all([
      mappingOverridesSync.setValue(syncOverrides),
      mappingOverridesLocal.setValue(localOverrides),
      mappingIgnoresSync.setValue(nextSyncIgnores),
      mappingIgnoresLocal.setValue(nextLocalIgnores),
    ]);
  }

  public async setRejectedCandidate(provider: MappingProvider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.setCandidateSuppression('rejected', provider, anilistId, externalId);
  }

  public async clearRejectedCandidate(provider: MappingProvider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.clearCandidateSuppression('rejected', provider, anilistId, externalId);
  }

  public async setBlockedCandidate(provider: MappingProvider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.setCandidateSuppression('blocked', provider, anilistId, externalId);
  }

  public async clearBlockedCandidate(provider: MappingProvider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.clearCandidateSuppression('blocked', provider, anilistId, externalId);
  }

  public async clearIgnore(provider: MappingProvider, anilistId: number): Promise<void> {
    const key = createRecordKey(provider, anilistId);
    this.ignored.delete(key);
    const [syncIgnores, localIgnores] = await Promise.all([
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
    ]);
    if (key in syncIgnores) delete syncIgnores[key];
    if (key in localIgnores) delete localIgnores[key];
    await Promise.all([
      mappingIgnoresSync.setValue(syncIgnores),
      mappingIgnoresLocal.setValue(localIgnores),
    ]);
  }

  public list(provider?: MappingProvider): MappingOverrideRecord[] {
    const entries: MappingOverrideRecord[] = [];
    for (const [key, entry] of this.map.entries()) {
      const parsed = parseRecordKey(key);
      if (!parsed) continue;
      if (provider && parsed.provider !== provider) continue;
      entries.push({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        externalId: entry.externalId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId);
    return entries;
  }

  public listIgnores(provider?: MappingProvider): MappingIgnoreRecord[] {
    const entries: MappingIgnoreRecord[] = [];
    for (const [key, entry] of this.ignored.entries()) {
      const parsed = parseRecordKey(key);
      if (!parsed) continue;
      if (provider && parsed.provider !== provider) continue;
      entries.push({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId);
    return entries;
  }

  public listRejectedCandidates(provider?: MappingProvider): MappingRejectedRecord[] {
    return this.listCandidateSuppressions(this.rejectedCandidates, provider);
  }

  public listBlockedCandidates(provider?: MappingProvider): MappingBlockedRecord[] {
    return this.listCandidateSuppressions(this.blockedCandidates, provider);
  }

  public exportState(): {
    overrides: MappingOverrideMap;
    ignores: MappingIgnoreMap;
    rejectedCandidates: MappingCandidateSuppressionMap;
    blockedCandidates: MappingCandidateSuppressionMap;
  } {
    const overrides: MappingOverrideMap = {};
    for (const [key, entry] of this.map.entries()) {
      overrides[key] = {
        provider: entry.provider,
        externalId: entry.externalId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      };
    }

    const ignores: MappingIgnoreMap = {};
    for (const [key, entry] of this.ignored.entries()) {
      ignores[key] = {
        provider: entry.provider,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      };
    }

    const rejectedCandidates: MappingCandidateSuppressionMap = {};
    for (const [key, entry] of this.rejectedCandidates.entries()) {
      rejectedCandidates[key] = {
        provider: entry.provider,
        externalId: entry.externalId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      };
    }

    const blockedCandidates: MappingCandidateSuppressionMap = {};
    for (const [key, entry] of this.blockedCandidates.entries()) {
      blockedCandidates[key] = {
        provider: entry.provider,
        externalId: entry.externalId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      };
    }

    return { overrides, ignores, rejectedCandidates, blockedCandidates };
  }

  public async importState(state: {
    overrides: MappingOverrideMap;
    ignores: MappingIgnoreMap;
    rejectedCandidates?: MappingCandidateSuppressionMap;
    blockedCandidates?: MappingCandidateSuppressionMap;
  }): Promise<void> {
    const overrides = { ...(state.overrides ?? {}) };
    const ignores = { ...(state.ignores ?? {}) };
    const rejectedCandidates = { ...(state.rejectedCandidates ?? {}) };
    const blockedCandidates = { ...(state.blockedCandidates ?? {}) };

    await Promise.all([
      mappingOverridesSync.setValue(overrides),
      mappingOverridesLocal.setValue(overrides),
      mappingIgnoresSync.setValue(ignores),
      mappingIgnoresLocal.setValue(ignores),
      mappingRejectedCandidatesSync.setValue(rejectedCandidates),
      mappingRejectedCandidatesLocal.setValue(rejectedCandidates),
      mappingBlockedCandidatesSync.setValue(blockedCandidates),
      mappingBlockedCandidatesLocal.setValue(blockedCandidates),
    ]);

    this.rebuildOverridesFromRecords(overrides, overrides);
    this.rebuildIgnoresFromRecords(ignores, ignores);
    this.rebuildRejectedCandidatesFromRecords(rejectedCandidates, rejectedCandidates);
    this.rebuildBlockedCandidatesFromRecords(blockedCandidates, blockedCandidates);
  }

  public async clearAll(provider?: MappingProvider): Promise<void> {
    if (!provider) {
      this.map.clear();
      this.reverse.clear();
      this.ignored.clear();
      this.rejectedCandidates.clear();
      this.blockedCandidates.clear();
      await Promise.all([
        mappingOverridesSync.setValue({}),
        mappingOverridesLocal.setValue({}),
        mappingIgnoresSync.setValue({}),
        mappingIgnoresLocal.setValue({}),
        mappingRejectedCandidatesSync.setValue({}),
        mappingRejectedCandidatesLocal.setValue({}),
        mappingBlockedCandidatesSync.setValue({}),
        mappingBlockedCandidatesLocal.setValue({}),
      ]);
      return;
    }

    const [
      syncOverrides,
      localOverrides,
      syncIgnores,
      localIgnores,
      syncRejectedCandidates,
      localRejectedCandidates,
      syncBlockedCandidates,
      localBlockedCandidates,
    ] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
      mappingRejectedCandidatesSync.getValue(),
      mappingRejectedCandidatesLocal.getValue(),
      mappingBlockedCandidatesSync.getValue(),
      mappingBlockedCandidatesLocal.getValue(),
    ]);

    for (const key of Object.keys(syncOverrides)) {
      if (key.startsWith(`${provider}:`)) delete syncOverrides[key];
    }
    for (const key of Object.keys(localOverrides)) {
      if (key.startsWith(`${provider}:`)) delete localOverrides[key];
    }
    for (const key of Object.keys(syncIgnores)) {
      if (key.startsWith(`${provider}:`)) delete syncIgnores[key];
    }
    for (const key of Object.keys(localIgnores)) {
      if (key.startsWith(`${provider}:`)) delete localIgnores[key];
    }
    for (const key of Object.keys(syncRejectedCandidates)) {
      if (key.startsWith(`${provider}:`)) delete syncRejectedCandidates[key];
    }
    for (const key of Object.keys(localRejectedCandidates)) {
      if (key.startsWith(`${provider}:`)) delete localRejectedCandidates[key];
    }
    for (const key of Object.keys(syncBlockedCandidates)) {
      if (key.startsWith(`${provider}:`)) delete syncBlockedCandidates[key];
    }
    for (const key of Object.keys(localBlockedCandidates)) {
      if (key.startsWith(`${provider}:`)) delete localBlockedCandidates[key];
    }

    await Promise.all([
      mappingOverridesSync.setValue(syncOverrides),
      mappingOverridesLocal.setValue(localOverrides),
      mappingIgnoresSync.setValue(syncIgnores),
      mappingIgnoresLocal.setValue(localIgnores),
      mappingRejectedCandidatesSync.setValue(syncRejectedCandidates),
      mappingRejectedCandidatesLocal.setValue(localRejectedCandidates),
      mappingBlockedCandidatesSync.setValue(syncBlockedCandidates),
      mappingBlockedCandidatesLocal.setValue(localBlockedCandidates),
    ]);

    this.rebuildOverridesFromRecords(syncOverrides, localOverrides);
    this.rebuildIgnoresFromRecords(syncIgnores, localIgnores);
    this.rebuildRejectedCandidatesFromRecords(syncRejectedCandidates, localRejectedCandidates);
    this.rebuildBlockedCandidatesFromRecords(syncBlockedCandidates, localBlockedCandidates);
  }

  private attachWatchers(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' && area !== 'local') return;

      const overrideChange =
        changes['sync:mappingOverrides'] ??
        changes['local:mappingOverridesCache'] ??
        changes.mappingOverrides ??
        changes.mappingOverridesCache;
      if (overrideChange?.newValue && typeof overrideChange.newValue === 'object') {
        this.rebuildOverridesFromRecords(overrideChange.newValue as Record<string, MappingOverrideEntry>);
      }

      const ignoreChange =
        changes['sync:ignoredMappings'] ??
        changes['local:ignoredMappingsCache'] ??
        changes.ignoredMappings ??
        changes.ignoredMappingsCache;
      if (ignoreChange?.newValue && typeof ignoreChange.newValue === 'object') {
        this.rebuildIgnoresFromRecords(ignoreChange.newValue as Record<string, MappingIgnoreEntry>);
      }

      const rejectedChange =
        changes['sync:rejectedMappingCandidates'] ??
        changes['local:rejectedMappingCandidatesCache'];
      if (rejectedChange?.newValue && typeof rejectedChange.newValue === 'object') {
        this.rebuildRejectedCandidatesFromRecords(rejectedChange.newValue as Record<string, MappingCandidateSuppressionEntry>);
      }

      const blockedChange =
        changes['sync:blockedMappingCandidates'] ??
        changes['local:blockedMappingCandidatesCache'];
      if (blockedChange?.newValue && typeof blockedChange.newValue === 'object') {
        this.rebuildBlockedCandidatesFromRecords(blockedChange.newValue as Record<string, MappingCandidateSuppressionEntry>);
      }
    });
  }

  private rebuildOverridesFromRecords(...recordsList: Array<Record<string, MappingOverrideEntry>>): void {
    this.map.clear();
    this.reverse.clear();
    const merged = new Map<MappingRecordKey, MappingOverrideEntry>();
    for (const records of recordsList) {
      for (const [key, entry] of Object.entries(records ?? {})) {
        const parsed = parseRecordKey(key);
        const normalized = normalizeOverrideEntry(entry);
        if (!parsed || !normalized) continue;
        const prev = merged.get(key as MappingRecordKey);
        if (!prev || normalized.updatedAt > (prev.updatedAt ?? 0)) {
          merged.set(key as MappingRecordKey, normalized);
        }
      }
    }
    for (const [key, entry] of merged.entries()) {
      this.map.set(key, entry);
      const parsed = parseRecordKey(key);
      if (!parsed) continue;
      this.addReverse(parsed.provider, entry.externalId, parsed.anilistId);
    }
  }

  private rebuildIgnoresFromRecords(...recordsList: Array<Record<string, MappingIgnoreEntry>>): void {
    this.ignored.clear();
    const merged = new Map<MappingRecordKey, MappingIgnoreEntry>();
    for (const records of recordsList) {
      for (const [key, entry] of Object.entries(records ?? {})) {
        if (!parseRecordKey(key)) continue;
        const normalized = normalizeIgnoreEntry(entry);
        if (!normalized) continue;
        const prev = merged.get(key as MappingRecordKey);
        if (!prev || normalized.updatedAt > (prev.updatedAt ?? 0)) {
          merged.set(key as MappingRecordKey, normalized);
        }
      }
    }
    for (const [key, entry] of merged.entries()) {
      this.ignored.set(key, entry);
    }
  }

  private rebuildRejectedCandidatesFromRecords(...recordsList: Array<Record<string, MappingCandidateSuppressionEntry>>): void {
    this.rebuildCandidateSuppressions(this.rejectedCandidates, ...recordsList);
  }

  private rebuildBlockedCandidatesFromRecords(...recordsList: Array<Record<string, MappingCandidateSuppressionEntry>>): void {
    this.rebuildCandidateSuppressions(this.blockedCandidates, ...recordsList);
  }

  private rebuildCandidateSuppressions(
    target: Map<MappingCandidateRecordKey, MappingCandidateSuppressionEntry>,
    ...recordsList: Array<Record<string, MappingCandidateSuppressionEntry>>
  ): void {
    target.clear();
    const merged = new Map<MappingCandidateRecordKey, MappingCandidateSuppressionEntry>();
    for (const records of recordsList) {
      for (const [key, entry] of Object.entries(records ?? {})) {
        if (!parseCandidateRecordKey(key)) continue;
        const normalized = normalizeCandidateSuppressionEntry(entry);
        if (!normalized) continue;
        const prev = merged.get(key as MappingCandidateRecordKey);
        if (!prev || normalized.updatedAt > (prev.updatedAt ?? 0)) {
          merged.set(key as MappingCandidateRecordKey, normalized);
        }
      }
    }
    for (const [key, entry] of merged.entries()) {
      target.set(key, entry);
    }
  }

  private listCandidateSuppressions(
    source: Map<MappingCandidateRecordKey, MappingCandidateSuppressionEntry>,
    provider?: MappingProvider,
  ): Array<MappingRejectedRecord | MappingBlockedRecord> {
    const entries: Array<MappingRejectedRecord | MappingBlockedRecord> = [];
    for (const [key, entry] of source.entries()) {
      const parsed = parseCandidateRecordKey(key);
      if (!parsed) continue;
      if (provider && parsed.provider !== provider) continue;
      entries.push({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        externalId: parsed.externalId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId);
    return entries;
  }

  private async setCandidateSuppression(
    type: 'rejected' | 'blocked',
    provider: MappingProvider,
    anilistId: number,
    externalId: MappingExternalId,
  ): Promise<void> {
    const key = createCandidateRecordKey(provider, anilistId, externalId);
    const entry: MappingCandidateSuppressionEntry = { provider, externalId, updatedAt: Date.now() };
    const [
      syncRejectedCandidates,
      localRejectedCandidates,
      syncBlockedCandidates,
      localBlockedCandidates,
    ] = await Promise.all([
      mappingRejectedCandidatesSync.getValue(),
      mappingRejectedCandidatesLocal.getValue(),
      mappingBlockedCandidatesSync.getValue(),
      mappingBlockedCandidatesLocal.getValue(),
    ]);

    this.rejectedCandidates.delete(key);
    this.blockedCandidates.delete(key);
    if (key in syncRejectedCandidates) delete syncRejectedCandidates[key];
    if (key in localRejectedCandidates) delete localRejectedCandidates[key];
    if (key in syncBlockedCandidates) delete syncBlockedCandidates[key];
    if (key in localBlockedCandidates) delete localBlockedCandidates[key];

    const targetMap = type === 'rejected' ? this.rejectedCandidates : this.blockedCandidates;
    const targetSync = type === 'rejected' ? syncRejectedCandidates : syncBlockedCandidates;
    const targetLocal = type === 'rejected' ? localRejectedCandidates : localBlockedCandidates;
    targetMap.set(key, entry);
    targetSync[key] = entry;
    targetLocal[key] = entry;

    await Promise.all([
      mappingRejectedCandidatesSync.setValue(syncRejectedCandidates),
      mappingRejectedCandidatesLocal.setValue(localRejectedCandidates),
      mappingBlockedCandidatesSync.setValue(syncBlockedCandidates),
      mappingBlockedCandidatesLocal.setValue(localBlockedCandidates),
    ]);
  }

  private async clearCandidateSuppression(
    type: 'rejected' | 'blocked',
    provider: MappingProvider,
    anilistId: number,
    externalId: MappingExternalId,
  ): Promise<void> {
    const key = createCandidateRecordKey(provider, anilistId, externalId);
    const [
      syncRejectedCandidates,
      localRejectedCandidates,
      syncBlockedCandidates,
      localBlockedCandidates,
    ] = await Promise.all([
      mappingRejectedCandidatesSync.getValue(),
      mappingRejectedCandidatesLocal.getValue(),
      mappingBlockedCandidatesSync.getValue(),
      mappingBlockedCandidatesLocal.getValue(),
    ]);

    const targetMap = type === 'rejected' ? this.rejectedCandidates : this.blockedCandidates;
    const targetSync = type === 'rejected' ? syncRejectedCandidates : syncBlockedCandidates;
    const targetLocal = type === 'rejected' ? localRejectedCandidates : localBlockedCandidates;
    targetMap.delete(key);
    if (key in targetSync) delete targetSync[key];
    if (key in targetLocal) delete targetLocal[key];

    await Promise.all([
      mappingRejectedCandidatesSync.setValue(syncRejectedCandidates),
      mappingRejectedCandidatesLocal.setValue(localRejectedCandidates),
      mappingBlockedCandidatesSync.setValue(syncBlockedCandidates),
      mappingBlockedCandidatesLocal.setValue(localBlockedCandidates),
    ]);
  }

  private addReverse(provider: MappingProvider, externalId: MappingExternalId, anilistId: number): void {
    const reverseKey = createReverseLookupKey(provider, externalId);
    const bucket = this.reverse.get(reverseKey);
    if (bucket) {
      bucket.add(anilistId);
      return;
    }
    this.reverse.set(reverseKey, new Set([anilistId]));
  }

  private removeReverse(provider: MappingProvider, externalId: MappingExternalId, anilistId: number): void {
    const reverseKey = createReverseLookupKey(provider, externalId);
    const bucket = this.reverse.get(reverseKey);
    if (!bucket) return;
    bucket.delete(anilistId);
    if (bucket.size === 0) {
      this.reverse.delete(reverseKey);
    }
  }
}
