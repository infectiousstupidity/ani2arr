/** Mapping override service for persisted manual mappings, ignores, and candidate suppressions. */
// src/mapping/overrides/overrides.service.ts

import type { MappingProviderIdRecord, MappingIgnoreRecord } from '@/mapping/types';
import type { Provider } from '@/providers';
import {
  createRecordKey,
  createReverseLookupKey,
  createCandidateRecordKey,
  parseRecordKey,
  parseCandidateRecordKey,
  isFiniteId,
  normalizeOverrideEntry,
  normalizeIgnoreEntry,
  normalizeCandidateSuppressionEntry,
} from './keys';
import {
  mappingOverridesStorage,
  mappingIgnoresStorage,
  mappingRejectedCandidatesStorage,
} from '@/mapping/overrides/overrides.storage';
import { PersistedMap } from '@/mapping/overrides/persisted-map';
import type { MappingIgnoreEntry, StoredMappingProviderIdEntry } from './types';

import { STORAGE_KEYS } from '@/storage/keys';

type ParsedRecordKey = { provider: Provider; anilistId: number };
type ParsedCandidateKey = { provider: Provider; anilistId: number; providerId: number };

const OVERRIDE_SORT = (a: { updatedAt: number; provider: string; anilistId: number }, b: { updatedAt: number; provider: string; anilistId: number }) =>
  b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId;

export class MappingOverridesService {
  private readonly overrides: PersistedMap<string, StoredMappingProviderIdEntry, ParsedRecordKey>;
  private readonly ignores: PersistedMap<string, MappingIgnoreEntry, ParsedRecordKey>;
  private readonly rejected: PersistedMap<string, StoredMappingProviderIdEntry, ParsedCandidateKey>;
  private readonly reverse = new Map<string, Set<number>>();
  private initialized = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.overrides = new PersistedMap({
      storage: mappingOverridesStorage,
      parseKey: parseRecordKey,
      normalize: normalizeOverrideEntry,
      storageChangeKeys: [STORAGE_KEYS.mappingOverrides],
    });
    this.ignores = new PersistedMap({
      storage: mappingIgnoresStorage,
      parseKey: parseRecordKey,
      normalize: normalizeIgnoreEntry,
      storageChangeKeys: [STORAGE_KEYS.mappingIgnores],
    });
    this.rejected = new PersistedMap({
      storage: mappingRejectedCandidatesStorage,
      parseKey: parseCandidateRecordKey,
      normalize: normalizeCandidateSuppressionEntry,
      storageChangeKeys: [STORAGE_KEYS.mappingRejectedCandidates],
    });
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([
      this.overrides.load(),
      this.ignores.load(),
      this.rejected.load(),
    ]);
    this.rebuildReverse();
    this.attachWatchers();
    this.initialized = true;
  }

  public get(provider: Provider, anilistId: number): number | null {
    const entry = this.overrides.get(createRecordKey(provider, anilistId));
    return entry ? entry.providerId : null;
  }

  public has(provider: Provider, anilistId: number): boolean {
    return this.overrides.has(createRecordKey(provider, anilistId));
  }

  public isIgnored(provider: Provider, anilistId: number): boolean {
    return this.ignores.has(createRecordKey(provider, anilistId));
  }

  public getCandidateSuppression(
    provider: Provider,
    anilistId: number,
    providerId: number,
  ): 'rejected' | null {
    const key = createCandidateRecordKey(provider, anilistId, providerId);
    if (this.rejected.has(key)) return 'rejected';
    return null;
  }

  public getLinkedAniListIds(provider: Provider, providerId: number): number[] {
    if (!isFiniteId(providerId)) return [];
    const bucket = this.reverse.get(createReverseLookupKey(provider, providerId));
    if (!bucket) return [];
    return [...bucket];
  }

  public async set(provider: Provider, anilistId: number, providerId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const entry: StoredMappingProviderIdEntry = { provider, providerId, updatedAt: Date.now() };

      const prev = this.overrides.get(key);
      if (prev) this.removeReverse(prev.provider, prev.providerId, anilistId);

      // Clear conflicting ignore
      this.ignores.delete(key);

      const candidateKey = createCandidateRecordKey(provider, anilistId, providerId);
      this.rejected.delete(candidateKey);

      this.overrides.set(key, entry);
      this.addReverse(provider, providerId, anilistId);

      await Promise.all([
        this.overrides.persist(),
        this.ignores.persist(),
        this.rejected.persist(),
      ]);
    });
  }

  public async clear(provider: Provider, anilistId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const prev = this.overrides.get(key);
      if (prev) this.removeReverse(prev.provider, prev.providerId, anilistId);
      this.overrides.delete(key);
      await this.overrides.persist();
    });
  }

  public async setIgnore(provider: Provider, anilistId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);

      // Clear conflicting override
      const override = this.overrides.get(key);
      if (override) {
        this.removeReverse(override.provider, override.providerId, anilistId);
        this.overrides.delete(key);
      }

      this.ignores.set(key, { provider, updatedAt: Date.now() });

      await Promise.all([
        this.overrides.persist(),
        this.ignores.persist(),
      ]);
    });
  }

  public async clearIgnore(provider: Provider, anilistId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      this.ignores.delete(createRecordKey(provider, anilistId));
      await this.ignores.persist();
    });
  }

  public async setRejectedCandidate(provider: Provider, anilistId: number, providerId: number): Promise<void> {
    await this.setCandidateSuppression(provider, anilistId, providerId);
  }

  public async clearRejectedCandidate(provider: Provider, anilistId: number, providerId: number): Promise<void> {
    await this.clearCandidateSuppression(provider, anilistId, providerId);
  }

  public list(provider?: Provider): MappingProviderIdRecord[] {
    const entries = this.overrides.list<MappingProviderIdRecord>(
      (_key, entry, parsed) => ({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        providerId: entry.providerId,
        updatedAt: entry.updatedAt,
      }),
      this.providerFilter(provider),
    );
    entries.sort(OVERRIDE_SORT);
    return entries;
  }

  public listIgnores(provider?: Provider): MappingIgnoreRecord[] {
    const entries = this.ignores.list<MappingIgnoreRecord>(
      (_key, entry, parsed) => ({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        updatedAt: entry.updatedAt,
      }),
      this.providerFilter(provider),
    );
    entries.sort(OVERRIDE_SORT);
    return entries;
  }

  public listRejectedCandidates(provider?: Provider): MappingProviderIdRecord[] {
    return this.listCandidateSuppressions(this.rejected, provider);
  }

  public exportState(): {
    overrides: Record<string, StoredMappingProviderIdEntry>;
    ignores: Record<string, MappingIgnoreEntry>;
    rejectedCandidates: Record<string, StoredMappingProviderIdEntry>;
  } {
    return {
      overrides: this.overrides.toRecord(),
      ignores: this.ignores.toRecord(),
      rejectedCandidates: this.rejected.toRecord(),
    };
  }

  public async importState(state: {
    overrides: Record<string, StoredMappingProviderIdEntry>;
    ignores: Record<string, MappingIgnoreEntry>;
    rejectedCandidates?: Record<string, StoredMappingProviderIdEntry>;
  }): Promise<void> {
    await this.enqueueWrite(async () => {
      await Promise.all([
        this.overrides.importRecords(state.overrides ?? {}),
        this.ignores.importRecords(state.ignores ?? {}),
        this.rejected.importRecords(state.rejectedCandidates ?? {}),
      ]);
      this.rebuildReverse();
    });
  }

  public async clearAll(provider?: Provider): Promise<void> {
    await this.enqueueWrite(async () => {
      if (!provider) {
        await Promise.all([
          this.overrides.resetStorage(),
          this.ignores.resetStorage(),
          this.rejected.resetStorage(),
        ]);
        this.reverse.clear();
        return;
      }

      const prefix = `${provider}:`;
      await Promise.all([
        this.overrides.deleteByPrefix(prefix),
        this.ignores.deleteByPrefix(prefix),
        this.rejected.deleteByPrefix(prefix),
      ]);
      this.rebuildReverse();
    });
  }

  private listCandidateSuppressions(
    source: PersistedMap<string, StoredMappingProviderIdEntry, ParsedCandidateKey>,
    provider?: Provider,
  ): MappingProviderIdRecord[] {
    const entries = source.list<MappingProviderIdRecord>(
      (_key, entry, parsed) => ({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        providerId: parsed.providerId,
        updatedAt: entry.updatedAt,
      }),
      this.providerFilter(provider),
    );
    entries.sort(OVERRIDE_SORT);
    return entries;
  }

  private providerFilter(provider: Provider | undefined): ((parsed: { provider: Provider }) => boolean) | undefined {
    if (!provider) return undefined;
    return (parsed) => parsed.provider === provider;
  }

  private async setCandidateSuppression(provider: Provider, anilistId: number, providerId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createCandidateRecordKey(provider, anilistId, providerId);
      const entry: StoredMappingProviderIdEntry = { provider, providerId, updatedAt: Date.now() };

      this.rejected.delete(key);
      this.rejected.set(key, entry);

      await this.rejected.persist();
    });
  }

  private async clearCandidateSuppression(provider: Provider, anilistId: number, providerId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      this.rejected.delete(createCandidateRecordKey(provider, anilistId, providerId));
      await this.rejected.persist();
    });
  }

  private attachWatchers(): void {
    const rebuildAll = async () => {
      await Promise.all([
        this.overrides.load(),
        this.ignores.load(),
        this.rejected.load(),
      ]);
      this.rebuildReverse();
    };

    this.overrides.attachWatcher(() => void rebuildAll());
    this.ignores.attachWatcher(() => void rebuildAll());
    this.rejected.attachWatcher(() => void rebuildAll());
  }

  private rebuildReverse(): void {
    this.reverse.clear();
    for (const [key, entry] of this.overrides.entries()) {
      const parsed = parseRecordKey(key);
      if (!parsed) continue;
      this.addReverse(parsed.provider, entry.providerId, parsed.anilistId);
    }
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeQueue.catch(() => {});
    const next = pending.then(operation);
    this.writeQueue = next.then(() => {}, () => {});
    return next;
  }

  private addReverse(provider: Provider, providerId: number, anilistId: number): void {
    const reverseKey = createReverseLookupKey(provider, providerId);
    const bucket = this.reverse.get(reverseKey);
    if (bucket) {
      bucket.add(anilistId);
      return;
    }
    this.reverse.set(reverseKey, new Set([anilistId]));
  }

  private removeReverse(provider: Provider, providerId: number, anilistId: number): void {
    const reverseKey = createReverseLookupKey(provider, providerId);
    const bucket = this.reverse.get(reverseKey);
    if (!bucket) return;
    bucket.delete(anilistId);
    if (bucket.size === 0) this.reverse.delete(reverseKey);
  }
}
