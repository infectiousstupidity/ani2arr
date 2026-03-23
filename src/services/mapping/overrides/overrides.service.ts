import type {
  MappingBlockedRecord,
  MappingExternalId,
  MappingIgnoreRecord,
  MappingOverrideRecord,
  MappingProvider,
  MappingRejectedRecord,
} from '@/shared/types';
import { PersistedMap } from './persisted-map';
import {
  type MappingRecordKey,
  type MappingCandidateRecordKey,
  type ReverseLookupKey,
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
  type MappingOverrideEntry,
  type MappingIgnoreEntry,
  type MappingCandidateSuppressionEntry,
  type MappingOverrideMap,
  type MappingIgnoreMap,
  type MappingCandidateSuppressionMap,
} from '@/lib/storage';

type ParsedRecordKey = { provider: MappingProvider; anilistId: number };
type ParsedCandidateKey = { provider: MappingProvider; anilistId: number; externalId: MappingExternalId };

const OVERRIDE_SORT = (a: { updatedAt: number; provider: string; anilistId: number }, b: { updatedAt: number; provider: string; anilistId: number }) =>
  b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId;

export class MappingOverridesService {
  private readonly overrides: PersistedMap<MappingRecordKey, MappingOverrideEntry, ParsedRecordKey>;
  private readonly ignores: PersistedMap<MappingRecordKey, MappingIgnoreEntry, ParsedRecordKey>;
  private readonly rejected: PersistedMap<MappingCandidateRecordKey, MappingCandidateSuppressionEntry, ParsedCandidateKey>;
  private readonly blocked: PersistedMap<MappingCandidateRecordKey, MappingCandidateSuppressionEntry, ParsedCandidateKey>;
  private readonly reverse = new Map<ReverseLookupKey, Set<number>>();
  private initialized = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.overrides = new PersistedMap({
      storage: mappingOverridesStorage,
      parseKey: parseRecordKey,
      normalize: normalizeOverrideEntry,
      storageChangeKeys: ['local:mappingOverrides'],
    });
    this.ignores = new PersistedMap({
      storage: mappingIgnoresStorage,
      parseKey: parseRecordKey,
      normalize: normalizeIgnoreEntry,
      storageChangeKeys: ['local:ignoredMappings'],
    });
    this.rejected = new PersistedMap({
      storage: mappingRejectedCandidatesStorage,
      parseKey: parseCandidateRecordKey,
      normalize: normalizeCandidateSuppressionEntry,
      storageChangeKeys: ['local:rejectedMappingCandidates'],
    });
    this.blocked = new PersistedMap({
      storage: mappingBlockedCandidatesStorage,
      parseKey: parseCandidateRecordKey,
      normalize: normalizeCandidateSuppressionEntry,
      storageChangeKeys: ['local:blockedMappingCandidates'],
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

  public get(provider: MappingProvider, anilistId: number): MappingExternalId | null {
    const entry = this.overrides.get(createRecordKey(provider, anilistId));
    return entry ? entry.externalId : null;
  }

  public has(provider: MappingProvider, anilistId: number): boolean {
    return this.overrides.has(createRecordKey(provider, anilistId));
  }

  public isIgnored(provider: MappingProvider, anilistId: number): boolean {
    return this.ignores.has(createRecordKey(provider, anilistId));
  }

  public getCandidateSuppression(
    provider: MappingProvider,
    anilistId: number,
    externalId: MappingExternalId,
  ): 'blocked' | 'rejected' | null {
    const key = createCandidateRecordKey(provider, anilistId, externalId);
    if (this.blocked.has(key)) return 'blocked';
    if (this.rejected.has(key)) return 'rejected';
    return null;
  }

  public getLinkedAniListIds(provider: MappingProvider, externalId: MappingExternalId): number[] {
    if (!isFiniteId(externalId.id)) return [];
    const bucket = this.reverse.get(createReverseLookupKey(provider, externalId));
    if (!bucket) return [];
    return Array.from(bucket);
  }

  public async set(provider: MappingProvider, anilistId: number, externalId: MappingExternalId): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const entry: MappingOverrideEntry = { provider, externalId, updatedAt: Date.now() };

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

  public async clear(provider: MappingProvider, anilistId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const prev = this.overrides.get(key);
      if (prev) this.removeReverse(prev.provider, prev.externalId, anilistId);
      this.overrides.delete(key);
      await this.overrides.persist();
    });
  }

  public async setIgnore(provider: MappingProvider, anilistId: number): Promise<void> {
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

  public async clearIgnore(provider: MappingProvider, anilistId: number): Promise<void> {
    await this.enqueueWrite(async () => {
      this.ignores.delete(createRecordKey(provider, anilistId));
      await this.ignores.persist();
    });
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

  public list(provider?: MappingProvider): MappingOverrideRecord[] {
    const entries = this.overrides.list<MappingOverrideRecord>(
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

  public listIgnores(provider?: MappingProvider): MappingIgnoreRecord[] {
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

  public listRejectedCandidates(provider?: MappingProvider): MappingRejectedRecord[] {
    return this.listCandidateSuppressions(this.rejected, provider);
  }

  public listBlockedCandidates(provider?: MappingProvider): MappingBlockedRecord[] {
    return this.listCandidateSuppressions(this.blocked, provider);
  }

  public exportState(): {
    overrides: MappingOverrideMap;
    ignores: MappingIgnoreMap;
    rejectedCandidates: MappingCandidateSuppressionMap;
    blockedCandidates: MappingCandidateSuppressionMap;
  } {
    return {
      overrides: this.overrides.toRecord(),
      ignores: this.ignores.toRecord(),
      rejectedCandidates: this.rejected.toRecord(),
      blockedCandidates: this.blocked.toRecord(),
    };
  }

  public async importState(state: {
    overrides: MappingOverrideMap;
    ignores: MappingIgnoreMap;
    rejectedCandidates?: MappingCandidateSuppressionMap;
    blockedCandidates?: MappingCandidateSuppressionMap;
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

  public async clearAll(provider?: MappingProvider): Promise<void> {
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
    source: PersistedMap<MappingCandidateRecordKey, MappingCandidateSuppressionEntry, ParsedCandidateKey>,
    provider?: MappingProvider,
  ): Array<MappingRejectedRecord | MappingBlockedRecord> {
    const entries = source.list<MappingRejectedRecord | MappingBlockedRecord>(
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

  private providerFilter(provider: MappingProvider | undefined): ((parsed: { provider: MappingProvider }) => boolean) | undefined {
    if (!provider) return undefined;
    return (parsed) => parsed.provider === provider;
  }

  private async setCandidateSuppression(
    type: 'rejected' | 'blocked',
    provider: MappingProvider,
    anilistId: number,
    externalId: MappingExternalId,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createCandidateRecordKey(provider, anilistId, externalId);
      const entry: MappingCandidateSuppressionEntry = { provider, externalId, updatedAt: Date.now() };

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
    provider: MappingProvider,
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
    const pending = this.writeQueue.catch(() => undefined);
    const next = pending.then(operation);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
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
    if (bucket.size === 0) this.reverse.delete(reverseKey);
  }
}
