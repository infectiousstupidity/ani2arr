// src/services/mapping/overrides.service.ts
import { browser } from 'wxt/browser';
import { mappingOverridesLocal, mappingOverridesSync, type MappingOverrideEntry } from '@/shared/utils/overrides-storage';

export class MappingOverridesService {
  private readonly map = new Map<number, MappingOverrideEntry>();
  private readonly reverse = new Map<number, Set<number>>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    const [sync, local] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
    ]);
    this.rebuildFromRecords(sync, local);
    this.attachWatchers();
    this.initialized = true;
  }

  public get(anilistId: number): number | null {
    const entry = this.map.get(anilistId);
    return entry ? entry.tvdbId : null;
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
    this.map.set(anilistId, entry);
    this.addReverse(tvdbId, anilistId);

    const [sync, local] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
    ]);
    const nextSync = { ...sync, [key]: entry };
    const nextLocal = { ...local, [key]: entry };
    await Promise.all([
      mappingOverridesSync.setValue(nextSync),
      mappingOverridesLocal.setValue(nextLocal),
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

  private attachWatchers(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' && area !== 'local') return;
      const syncKey = 'mappingOverrides';
      const localKey = 'mappingOverridesCache';
      const change = changes[`sync:${syncKey}`] ?? changes[`local:${localKey}`] ?? changes[syncKey] ?? changes[localKey];
      if (!change) return;
      const next = change.newValue as Record<string, MappingOverrideEntry> | undefined;
      if (!next || typeof next !== 'object') return;
      this.rebuildFromRecords(next);
    });
  }

  private rebuildFromRecords(...recordsList: Array<Record<string, MappingOverrideEntry>>): void {
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
