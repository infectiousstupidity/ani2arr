// src/services/mapping/overrides.service.ts
import { browser } from 'wxt/browser';
import { mappingOverridesLocal, mappingOverridesSync, type MappingOverrideEntry } from '@/shared/utils/overrides-storage';

export class MappingOverridesService {
  private readonly map = new Map<number, MappingOverrideEntry>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    const [sync, local] = await Promise.all([
      mappingOverridesSync.getValue(),
      mappingOverridesLocal.getValue(),
    ]);
    this.hydrateFromRecords(sync);
    this.hydrateFromRecords(local);
    this.attachWatchers();
    this.initialized = true;
  }

  public get(anilistId: number): number | null {
    const entry = this.map.get(anilistId);
    return entry ? entry.tvdbId : null;
  }

  public has(anilistId: number): boolean {
    return this.map.has(anilistId);
  }

  public async set(anilistId: number, tvdbId: number): Promise<void> {
    const updatedAt = Date.now();
    const key = String(anilistId);
    const entry: MappingOverrideEntry = { tvdbId, updatedAt };
    this.map.set(anilistId, entry);

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

  private hydrateFromRecords(records: Record<string, MappingOverrideEntry>): void {
    for (const [key, entry] of Object.entries(records ?? {})) {
      const id = Number(key);
      if (!Number.isFinite(id) || typeof entry?.tvdbId !== 'number') continue;
      const prev = this.map.get(id);
      if (!prev || (typeof entry.updatedAt === 'number' && entry.updatedAt > (prev.updatedAt ?? 0))) {
        this.map.set(id, { tvdbId: entry.tvdbId, updatedAt: entry.updatedAt ?? Date.now() });
      }
    }
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
      this.hydrateFromRecords(next);
    });
  }
}

