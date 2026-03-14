// src/services/mapping/overrides.service.ts
import { browser } from 'wxt/browser';
import {
  mappingIgnoresLocal,
  mappingIgnoresSync,
  mappingOverridesLocal,
  mappingOverridesSync,
  type MappingIgnoreMap,
  type MappingIgnoreEntry,
  type MappingOverrideMap,
  type MappingOverrideEntry,
} from '@/services/mapping/overrides-storage';
import type {
  MappingExternalId,
  MappingIgnoreRecord,
  MappingOverrideRecord,
  MappingProvider,
} from '@/shared/types';

type MappingRecordKey = `${MappingProvider}:${number}`;
type ReverseLookupKey = `${MappingProvider}:${MappingExternalId['kind']}:${number}`;

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

export class MappingOverridesService {
  private readonly map = new Map<MappingRecordKey, MappingOverrideEntry>();
  private readonly reverse = new Map<ReverseLookupKey, Set<number>>();
  private readonly ignored = new Map<MappingRecordKey, MappingIgnoreEntry>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    const [syncOverrides, localOverrides, syncIgnores, localIgnores] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
    ]);
    this.rebuildOverridesFromRecords(syncOverrides, localOverrides);
    this.rebuildIgnoresFromRecords(syncIgnores, localIgnores);
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

    const [syncOverrides, localOverrides, syncIgnores, localIgnores] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
    ]);

    if (this.ignored.has(key)) {
      this.ignored.delete(key);
    }
    if (key in syncIgnores) delete syncIgnores[key];
    if (key in localIgnores) delete localIgnores[key];

    this.map.set(key, entry);
    this.addReverse(provider, externalId, anilistId);

    const nextSync = { ...syncOverrides, [key]: entry };
    const nextLocal = { ...localOverrides, [key]: entry };
    await Promise.all([
      mappingOverridesSync.setValue(nextSync),
      mappingOverridesLocal.setValue(nextLocal),
      mappingIgnoresSync.setValue(syncIgnores),
      mappingIgnoresLocal.setValue(localIgnores),
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

  public exportState(): { overrides: MappingOverrideMap; ignores: MappingIgnoreMap } {
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

    return { overrides, ignores };
  }

  public async importState(state: { overrides: MappingOverrideMap; ignores: MappingIgnoreMap }): Promise<void> {
    const overrides = { ...(state.overrides ?? {}) };
    const ignores = { ...(state.ignores ?? {}) };

    await Promise.all([
      mappingOverridesSync.setValue(overrides),
      mappingOverridesLocal.setValue(overrides),
      mappingIgnoresSync.setValue(ignores),
      mappingIgnoresLocal.setValue(ignores),
    ]);

    this.rebuildOverridesFromRecords(overrides, overrides);
    this.rebuildIgnoresFromRecords(ignores, ignores);
  }

  public async clearAll(provider?: MappingProvider): Promise<void> {
    if (!provider) {
      this.map.clear();
      this.reverse.clear();
      this.ignored.clear();
      await Promise.all([
        mappingOverridesSync.setValue({}),
        mappingOverridesLocal.setValue({}),
        mappingIgnoresSync.setValue({}),
        mappingIgnoresLocal.setValue({}),
      ]);
      return;
    }

    const [syncOverrides, localOverrides, syncIgnores, localIgnores] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
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

    await Promise.all([
      mappingOverridesSync.setValue(syncOverrides),
      mappingOverridesLocal.setValue(localOverrides),
      mappingIgnoresSync.setValue(syncIgnores),
      mappingIgnoresLocal.setValue(localIgnores),
    ]);

    this.rebuildOverridesFromRecords(syncOverrides, localOverrides);
    this.rebuildIgnoresFromRecords(syncIgnores, localIgnores);
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
