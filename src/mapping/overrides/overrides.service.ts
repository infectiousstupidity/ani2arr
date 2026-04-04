/** Mapping override service for persisted manual mappings, ignores, and candidate suppressions. */
// src/mapping/overrides/overrides.service.ts

import type { MappingExternalId, MappingExternalIdRecord, MappingIgnoreRecord } from '@/mapping/types';
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
  mappingBlockedCandidatesStorage,
} from '@/mapping/overrides/overrides.storage';
import { PersistedMap } from '@/mapping/overrides/persisted-map';
import type { MappingIgnoreEntry, StoredMappingExternalIdEntry } from './types';

import { STORAGE_KEYS } from '@/storage/keys';

type ParsedRecordKey = { provider: Provider; anilistId: number };
type ParsedCandidateKey = { provider: Provider; anilistId: number; externalId: MappingExternalId };

const OVERRIDE_SORT = (a: { updatedAt: number; provider: string; anilistId: number }, b: { updatedAt: number; provider: string; anilistId: number }) =>
  b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId;

export class MappingOverridesService {
  private readonly overrides: PersistedMap<string, StoredMappingExternalIdEntry, ParsedRecordKey>;
  private readonly ignores: PersistedMap<string, MappingIgnoreEntry, ParsedRecordKey>;
  private readonly rejected: PersistedMap<string, StoredMappingExternalIdEntry, ParsedCandidateKey>;
  private readonly blocked: PersistedMap<string, StoredMappingExternalIdEntry, ParsedCandidateKey>;
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
    this.blocked = new PersistedMap({
      storage: mappingBlockedCandidatesStorage,
      parseKey: parseCandidateRecordKey,
      normalize: normalizeCandidateSuppressionEntry,
      storageChangeKeys: [STORAGE_KEYS.mappingBlockedCandidates],
    });
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([
      this.overrides.load(),
      this.ignores.load(),
      this.rejected.load(),
      this.blocked.load(),
    ]);
    this.rebuildReverse();
    this.attachWatchers();
    this.initialized = true;
  }

  public get(provider: Provider, anilistId: number): MappingExternalId | null {
    const entry = this.overrides.get(createRecordKey(provider, anilistId));
    return entry ? entry.externalId : null;
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
    externalId: MappingExternalId,
  ): 'blocked' | 'rejected' | null {
    const key = createCandidateRecordKey(provider, anilistId, externalId);
    if (this.blocked.has(key)) return 'blocked';
    if (this.rejected.has(key)) return 'rejected';
    return null;
  }

  public getLinkedAniListIds(provider: Provider, externalId: MappingExternalId): number[] {
    if (!isFiniteId(externalId.id)) return [];
    const bucket = this.reverse.get(createReverseLookupKey(provider, externalId));
    if (!bucket) return [];
    return [...bucket];
  }

  public async set(provider: Provider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const entry: StoredMappingExternalIdEntry = { provider, externalId, updatedAt: Date.now() };

      const prev = this.overrides.get(key);
      if (prev) this.removeReverse(prev.provider, prev.externalId, anilistId);

      // Clear conflicting ignore
      this.ignores.delete(key);

      // Clear conflicting candidate suppressions
      const candidateKey = createCandidateRecordKey(provider, anilistId, externalId);
      this.rejected.delete(candidateKey);
      this.blocked.delete(candidateKey);

      this.overrides.set(key, entry);
      this.addReverse(provider, externalId, anilistId);

      await Promise.all([
        this.overrides.persist(),
        this.ignores.persist(),
        this.rejected.persist(),
        this.blocked.persist(),
      ]);
    });
  }

  public async clear(provider: Provider, anilistId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const prev = this.overrides.get(key);
      if (prev) this.removeReverse(prev.provider, prev.externalId, anilistId);
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
        this.removeReverse(override.provider, override.externalId, anilistId);
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

  public async setRejectedCandidate(provider: Provider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.setCandidateSuppression('rejected', provider, anilistId, externalId);
  }

  public async clearRejectedCandidate(provider: Provider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.clearCandidateSuppression('rejected', provider, anilistId, externalId);
  }

  public async setBlockedCandidate(provider: Provider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.setCandidateSuppression('blocked', provider, anilistId, externalId);
  }

  public async clearBlockedCandidate(provider: Provider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.clearCandidateSuppression('blocked', provider, anilistId, externalId);
  }

  public list(provider?: Provider): MappingExternalIdRecord[] {
    const entries = this.overrides.list<MappingExternalIdRecord>(
      (_key, entry, parsed) => ({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        externalId: entry.externalId,
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

  public listRejectedCandidates(provider?: Provider): MappingExternalIdRecord[] {
    return this.listCandidateSuppressions(this.rejected, provider);
  }

  public listBlockedCandidates(provider?: Provider): MappingExternalIdRecord[] {
    return this.listCandidateSuppressions(this.blocked, provider);
  }

  public exportState(): {
    overrides: Record<string, StoredMappingExternalIdEntry>;
    ignores: Record<string, MappingIgnoreEntry>;
    rejectedCandidates: Record<string, StoredMappingExternalIdEntry>;
    blockedCandidates: Record<string, StoredMappingExternalIdEntry>;
  } {
    return {
      overrides: this.overrides.toRecord(),
      ignores: this.ignores.toRecord(),
      rejectedCandidates: this.rejected.toRecord(),
      blockedCandidates: this.blocked.toRecord(),
    };
  }

  public async importState(state: {
    overrides: Record<string, StoredMappingExternalIdEntry>;
    ignores: Record<string, MappingIgnoreEntry>;
    rejectedCandidates?: Record<string, StoredMappingExternalIdEntry>;
    blockedCandidates?: Record<string, StoredMappingExternalIdEntry>;
  }): Promise<void> {
    await this.enqueueWrite(async () => {
      await Promise.all([
        this.overrides.importRecords(state.overrides ?? {}),
        this.ignores.importRecords(state.ignores ?? {}),
        this.rejected.importRecords(state.rejectedCandidates ?? {}),
        this.blocked.importRecords(state.blockedCandidates ?? {}),
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
          this.blocked.resetStorage(),
        ]);
        this.reverse.clear();
        return;
      }

      const prefix = `${provider}:`;
      await Promise.all([
        this.overrides.deleteByPrefix(prefix),
        this.ignores.deleteByPrefix(prefix),
        this.rejected.deleteByPrefix(prefix),
        this.blocked.deleteByPrefix(prefix),
      ]);
      this.rebuildReverse();
    });
  }

  private listCandidateSuppressions(
    source: PersistedMap<string, StoredMappingExternalIdEntry, ParsedCandidateKey>,
    provider?: Provider,
  ): MappingExternalIdRecord[] {
    const entries = source.list<MappingExternalIdRecord>(
      (_key, entry, parsed) => ({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        externalId: parsed.externalId,
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

  private async setCandidateSuppression(
    type: 'rejected' | 'blocked',
    provider: Provider,
    anilistId: number,
    externalId: MappingExternalId,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createCandidateRecordKey(provider, anilistId, externalId);
      const entry: StoredMappingExternalIdEntry = { provider, externalId, updatedAt: Date.now() };

      // Clear from both, then set on target
      this.rejected.delete(key);
      this.blocked.delete(key);

      const target = type === 'rejected' ? this.rejected : this.blocked;
      target.set(key, entry);

      await Promise.all([
        this.rejected.persist(),
        this.blocked.persist(),
      ]);
    });
  }

  private async clearCandidateSuppression(
    type: 'rejected' | 'blocked',
    provider: Provider,
    anilistId: number,
    externalId: MappingExternalId,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const target = type === 'rejected' ? this.rejected : this.blocked;
      target.delete(createCandidateRecordKey(provider, anilistId, externalId));
      await target.persist();
    });
  }

  private attachWatchers(): void {
    const rebuildAll = async () => {
      await Promise.all([
        this.overrides.load(),
        this.ignores.load(),
        this.rejected.load(),
        this.blocked.load(),
      ]);
      this.rebuildReverse();
    };

    this.overrides.attachWatcher(() => void rebuildAll());
    this.ignores.attachWatcher(() => void rebuildAll());
    this.rejected.attachWatcher(() => void rebuildAll());
    this.blocked.attachWatcher(() => void rebuildAll());
  }

  private rebuildReverse(): void {
    this.reverse.clear();
    for (const [key, entry] of this.overrides.entries()) {
      const parsed = parseRecordKey(key);
      if (!parsed) continue;
      this.addReverse(parsed.provider, entry.externalId, parsed.anilistId);
    }
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeQueue.catch(() => {});
    const next = pending.then(operation);
    this.writeQueue = next.then(() => {}, () => {});
    return next;
  }

  private addReverse(provider: Provider, externalId: MappingExternalId, anilistId: number): void {
    const reverseKey = createReverseLookupKey(provider, externalId);
    const bucket = this.reverse.get(reverseKey);
    if (bucket) {
      bucket.add(anilistId);
      return;
    }
    this.reverse.set(reverseKey, new Set([anilistId]));
  }

  private removeReverse(provider: Provider, externalId: MappingExternalId, anilistId: number): void {
    const reverseKey = createReverseLookupKey(provider, externalId);
    const bucket = this.reverse.get(reverseKey);
    if (!bucket) return;
    bucket.delete(anilistId);
    if (bucket.size === 0) this.reverse.delete(reverseKey);
  }
}
