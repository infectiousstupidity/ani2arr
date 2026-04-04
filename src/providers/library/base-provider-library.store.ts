/** Shared provider-library cache refresh and persistence flow. */
// src/providers/library/base-provider-library.store.ts

import { getExtensionOptionsSnapshot, type ExtensionOptions } from '@/options';
import { STORAGE_POLICIES } from '@/storage';
import { logError, normalizeError } from '@/shared/errors';
import type { ProviderCredentials } from '@/providers';
import type { ProviderCredentialsResolver, ProviderLibraryCaches } from './types';

type StoreIndexer<TSnapshot> = {
  reset(): void;
  reindex(list: TSnapshot[]): void;
};

type BaseProviderLibraryStoreAdapter<TFullEntry, TSnapshot, TExternalId extends number> = {
  cacheKey: string;
  getCredentials: ProviderCredentialsResolver;
  fetchAll(credentials: ProviderCredentials): Promise<TFullEntry[]>;
  toSnapshot(entry: TFullEntry): TSnapshot;
  getExternalId(entry: TSnapshot): TExternalId;
};

export class BaseProviderLibraryStore<
  TFullEntry,
  TSnapshot,
  TExternalId extends number,
> {
  private inflightRefresh: Promise<TSnapshot[]> | null = null;
  private indexesReady = false;

  constructor(
    private readonly caches: ProviderLibraryCaches<TSnapshot>,
    private readonly indexer: StoreIndexer<TSnapshot>,
    private readonly adapter: BaseProviderLibraryStoreAdapter<TFullEntry, TSnapshot, TExternalId>,
    private readonly logScope: string,
  ) {}

  async getLeanList(): Promise<TSnapshot[]> {
    const cached = await this.caches.lean.read(this.adapter.cacheKey);
    if (cached) {
      this.ensureIndexes(cached.value);
      if (cached.stale && !this.inflightRefresh) {
        this.refreshCache().catch(error => {
          logError(normalizeError(error), `${this.logScope}:backgroundRefresh`);
        });
      }
      return cached.value;
    }

    return this.refreshCache();
  }

  async refreshCache(optionsOverride?: ExtensionOptions): Promise<TSnapshot[]> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }

    const job = (async () => {
      const cached = await this.caches.lean.read(this.adapter.cacheKey);
      const fallbackList = cached?.value ?? [];

      try {
        const options = optionsOverride ?? (await getExtensionOptionsSnapshot());
        const credentials = this.adapter.getCredentials(options);

        if (!credentials) {
          this.indexer.reset();
          this.indexesReady = false;
          await this.caches.lean.remove(this.adapter.cacheKey);
          return [];
        }

        const fullEntries = await this.adapter.fetchAll(credentials);
        const snapshots = fullEntries
          .map(entry => this.adapter.toSnapshot(entry))
          .filter(snapshot => Number.isFinite(this.adapter.getExternalId(snapshot)));

        this.setIndexedList(snapshots);
        await this.caches.lean.write(this.adapter.cacheKey, snapshots, {
          staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
          hardMs: STORAGE_POLICIES.providerLibrary.hardMs,
        });

        return snapshots;
      } catch (error) {
        const normalized = normalizeError(error);
        logError(normalized, `${this.logScope}:refreshCache`);

        await this.caches.lean.write(this.adapter.cacheKey, fallbackList, {
          staleMs: STORAGE_POLICIES.providerLibrary.errorStaleMs,
          hardMs: STORAGE_POLICIES.providerLibrary.errorHardMs,
          meta: { lastErrorCode: normalized.code },
        });

        this.setIndexedList(fallbackList);
        return fallbackList;
      } finally {
        this.inflightRefresh = null;
      }
    })();

    this.inflightRefresh = job;
    return job;
  }

  async addToCache(entry: TFullEntry): Promise<void> {
    const current = await this.getLeanList();
    const snapshot = this.adapter.toSnapshot(entry);
    const externalId = this.adapter.getExternalId(snapshot);
    const idx = current.findIndex(item => this.adapter.getExternalId(item) === externalId);
    const updated =
      idx === -1 ? [...current, snapshot] : [...current.slice(0, idx), snapshot, ...current.slice(idx + 1)];

    this.setIndexedList(updated);
    await this.caches.lean.write(this.adapter.cacheKey, updated, {
      staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
      hardMs: STORAGE_POLICIES.providerLibrary.hardMs,
    });
  }

  async removeFromCache(externalId: TExternalId): Promise<void> {
    const current = await this.getLeanList();
    const filtered = current.filter(item => this.adapter.getExternalId(item) !== externalId);
    if (filtered.length === current.length) return;

    this.setIndexedList(filtered);
    await this.caches.lean.write(this.adapter.cacheKey, filtered, {
      staleMs: STORAGE_POLICIES.providerLibrary.staleMs,
      hardMs: STORAGE_POLICIES.providerLibrary.hardMs,
    });
  }

  private ensureIndexes(list: TSnapshot[]): void {
    if (list.length === 0 || this.indexesReady) return;
    this.setIndexedList(list);
  }

  private setIndexedList(list: TSnapshot[]): void {
    this.indexer.reindex(list);
    this.indexesReady = true;
  }
}
