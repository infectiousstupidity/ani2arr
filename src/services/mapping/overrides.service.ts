// src/services/mapping/overrides.service.ts
import { browser } from 'wxt/browser';
import {
  mappingIgnoresLocal,
  mappingIgnoresSync,
  mappingOverridesLocal,
  mappingOverridesSync,
  type MappingIgnoreEntry,
  type MappingOverrideEntry,
} from '@/shared/utils/overrides-storage';
import type { MappingIgnoreRecord } from '@/shared/types';

export class MappingOverridesService {
  private readonly map = new Map<number, MappingOverrideEntry>();
  private readonly reverse = new Map<number, Set<number>>();
  private readonly ignored = new Map<number, MappingIgnoreEntry>();
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

  public get(anilistId: number): number | null {
    const entry = this.map.get(anilistId);
    return entry ? entry.tvdbId : null;
  }

  public isIgnored(anilistId: number): boolean {
    return this.ignored.has(anilistId);
  }

  public getLinkedAniListIds(tvdbId: number): number[] {
    if (typeof tvdbId !== 'number' || !Number.isFinite(tvdbId)) return [];
    const bucket = this.reverse.get(tvdbId);
    if (!bucket) return [];
    return Array.from(bucket);
  }

  public has(anilistId: number): boolean {
    return this.map.has(anilistId);
  }

  public async set(anilistId: number, tvdbId: number): Promise<void> {
    const updatedAt = Date.now();
    const key = String(anilistId);
    const entry: MappingOverrideEntry = { tvdbId, updatedAt };
    const prev = this.map.get(anilistId);
    if (prev) {
      this.removeReverse(prev.tvdbId, anilistId);
    }

    const [syncOverrides, localOverrides, syncIgnores, localIgnores] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
    ]);

    if (this.ignored.has(anilistId)) {
      this.ignored.delete(anilistId);
    }
    if (key in syncIgnores) delete syncIgnores[key];
    if (key in localIgnores) delete localIgnores[key];

    this.map.set(anilistId, entry);
    this.addReverse(tvdbId, anilistId);

    const nextSync = { ...syncOverrides, [key]: entry };
    const nextLocal = { ...localOverrides, [key]: entry };
    await Promise.all([
      mappingOverridesSync.setValue(nextSync),
      mappingOverridesLocal.setValue(nextLocal),
      mappingIgnoresSync.setValue(syncIgnores),
      mappingIgnoresLocal.setValue(localIgnores),
    ]);
  }

  public async clear(anilistId: number): Promise<void> {
    const key = String(anilistId);
    const prev = this.map.get(anilistId);
    if (prev) {
      this.removeReverse(prev.tvdbId, anilistId);
    }
    this.map.delete(anilistId);
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

  public async setIgnore(anilistId: number): Promise<void> {
    const key = String(anilistId);
    const updatedAt = Date.now();

    const [syncOverrides, localOverrides, syncIgnores, localIgnores] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
      mappingIgnoresSync.getValue(),
      mappingIgnoresLocal.getValue(),
    ]);

    const override = this.map.get(anilistId);
    if (override) {
      this.removeReverse(override.tvdbId, anilistId);
      this.map.delete(anilistId);
      if (key in syncOverrides) delete syncOverrides[key];
      if (key in localOverrides) delete localOverrides[key];
    }

    const ignoreEntry: MappingIgnoreEntry = { updatedAt };
    this.ignored.set(anilistId, ignoreEntry);

    const nextSyncIgnores = { ...syncIgnores, [key]: ignoreEntry };
    const nextLocalIgnores = { ...localIgnores, [key]: ignoreEntry };

    await Promise.all([
      mappingOverridesSync.setValue(syncOverrides),
      mappingOverridesLocal.setValue(localOverrides),
      mappingIgnoresSync.setValue(nextSyncIgnores),
      mappingIgnoresLocal.setValue(nextLocalIgnores),
    ]);
  }

  public async clearIgnore(anilistId: number): Promise<void> {
    const key = String(anilistId);
    this.ignored.delete(anilistId);
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

  public list(): Array<{ anilistId: number; tvdbId: number; updatedAt: number }> {
    const entries: Array<{ anilistId: number; tvdbId: number; updatedAt: number }> = [];
    for (const [anilistId, entry] of this.map.entries()) {
      if (typeof entry?.tvdbId !== 'number') continue;
      entries.push({
        anilistId,
        tvdbId: entry.tvdbId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  public listIgnores(): MappingIgnoreRecord[] {
    const entries: MappingIgnoreRecord[] = [];
    for (const [anilistId, entry] of this.ignored.entries()) {
      entries.push({
        anilistId,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      });
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  public async clearAll(): Promise<void> {
    this.map.clear();
    this.reverse.clear();
    await Promise.all([
      mappingOverridesSync.setValue({}),
      mappingOverridesLocal.setValue({}),
    ]);
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
    const merged = new Map<number, MappingOverrideEntry>();
    for (const records of recordsList) {
      for (const [key, entry] of Object.entries(records ?? {})) {
        const id = Number(key);
        if (!Number.isFinite(id) || typeof entry?.tvdbId !== 'number') continue;
        const normalized: MappingOverrideEntry = {
          tvdbId: entry.tvdbId,
          updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
        };
        const prev = merged.get(id);
        if (!prev || normalized.updatedAt > (prev.updatedAt ?? 0)) {
          merged.set(id, normalized);
        }
      }
    }
    for (const [id, entry] of merged.entries()) {
      this.map.set(id, entry);
      this.addReverse(entry.tvdbId, id);
    }
  }

  private rebuildIgnoresFromRecords(...recordsList: Array<Record<string, MappingIgnoreEntry>>): void {
    this.ignored.clear();
    const merged = new Map<number, MappingIgnoreEntry>();
    for (const records of recordsList) {
      for (const [key, entry] of Object.entries(records ?? {})) {
        const id = Number(key);
        if (!Number.isFinite(id)) continue;
        const normalized: MappingIgnoreEntry = {
          updatedAt: typeof entry?.updatedAt === 'number' ? entry.updatedAt : Date.now(),
        };
        const prev = merged.get(id);
        if (!prev || normalized.updatedAt > (prev.updatedAt ?? 0)) {
          merged.set(id, normalized);
        }
      }
    }
    for (const [id, entry] of merged.entries()) {
      this.ignored.set(id, entry);
    }
  }

  private addReverse(tvdbId: number, anilistId: number): void {
    const bucket = this.reverse.get(tvdbId);
    if (bucket) {
      bucket.add(anilistId);
      return;
    }
    this.reverse.set(tvdbId, new Set([anilistId]));
  }

  private removeReverse(tvdbId: number, anilistId: number): void {
    const bucket = this.reverse.get(tvdbId);
    if (!bucket) return;
    bucket.delete(anilistId);
    if (bucket.size === 0) {
      this.reverse.delete(tvdbId);
    }
  }
}
