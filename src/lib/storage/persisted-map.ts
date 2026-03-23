/** Internal helper for record-backed persisted maps with normalization, rebuild, and watch support. */
// src/lib/storage/persisted-map.ts

import { browser } from 'wxt/browser';
import type { WxtStorageItem } from '@wxt-dev/storage';

type Normalizer<V> = (entry: unknown) => V | null;
type KeyParser<P> = (key: string) => P | null;

export interface PersistedMapOptions<V extends { updatedAt: number }, P> {
  storage: WxtStorageItem<Record<string, V>, Record<string, V>>;
  parseKey: KeyParser<P>;
  normalize: Normalizer<V>;
  storageChangeKeys: string[];
}

export class PersistedMap<K extends string, V extends { updatedAt: number }, P = unknown> {
  private readonly map = new Map<K, V>();
  private readonly storageItem: WxtStorageItem<Record<string, V>, Record<string, V>>;
  private readonly parseKey: KeyParser<P>;
  private readonly normalize: Normalizer<V>;
  private readonly storageChangeKeys: string[];

  constructor(options: PersistedMapOptions<V, P>) {
    this.storageItem = options.storage;
    this.parseKey = options.parseKey;
    this.normalize = options.normalize;
    this.storageChangeKeys = options.storageChangeKeys;
  }

  public async load(): Promise<void> {
    const records = await this.storageItem.getValue();
    this.rebuild(records);
  }

  public attachWatcher(rebuild: () => void): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const key of this.storageChangeKeys) {
        const change = changes[key];
        if (change?.newValue && typeof change.newValue === 'object') {
          rebuild();
          return;
        }
      }
    });
  }

  public get(key: K): V | undefined {
    return this.map.get(key);
  }

  public has(key: K): boolean {
    return this.map.has(key);
  }

  public set(key: K, value: V): void {
    this.map.set(key, value);
  }

  public delete(key: K): boolean {
    return this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  public async persist(): Promise<void> {
    const record: Record<string, V> = {};
    for (const [key, value] of this.map.entries()) {
      record[key] = value;
    }
    await this.storageItem.setValue(record);
  }

  public async resetStorage(): Promise<void> {
    this.map.clear();
    await this.storageItem.setValue({});
  }

  public async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
      }
    }
    await this.persist();
  }

  public list<R>(
    transform: (key: K, value: V, parsed: P) => R | null,
    filter?: (parsed: P) => boolean,
  ): R[] {
    const entries: R[] = [];
    for (const [key, value] of this.map.entries()) {
      const parsed = this.parseKey(key);
      if (!parsed) continue;
      if (filter && !filter(parsed)) continue;
      const record = transform(key, value, parsed);
      if (record) entries.push(record);
    }
    return entries;
  }

  public toRecord(): Record<string, V> {
    const record: Record<string, V> = {};
    for (const [key, value] of this.map.entries()) {
      record[key] = value;
    }
    return record;
  }

  public rebuild(records: Record<string, V>): void {
    this.map.clear();
    for (const [key, entry] of Object.entries(records ?? {})) {
      if (!this.parseKey(key)) continue;
      const normalized = this.normalize(entry);
      if (!normalized) continue;
      this.map.set(key as K, normalized);
    }
  }

  public async importRecords(records: Record<string, V>): Promise<void> {
    this.rebuild(records);
    await this.persist();
  }
}
