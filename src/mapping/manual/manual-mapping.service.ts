/** Manual mapping service for persisted manual mappings, ignored mappings, and rejected candidates. */
// src/mapping/manual/manual-mapping.service.ts

import type { AniListId } from '@/anilist';
import { parseProviderIdentity, type Provider, type ProviderIdFor, type ProviderTargetId, type TmdbId, type TvdbId } from '@/providers';
import {
  createRecordKey,
  createReverseLookupKey,
  createCandidateRecordKey,
  isFiniteId,
  parseRecordKey,
} from './keys';
import { createManualMappingPersistedMaps } from '@/mapping/manual/manual-mapping.storage';
import { PersistedMap } from '@/mapping/manual/persisted-map';
import type {
  PersistedMappingIgnoreRecord,
  PersistedProviderMappingRecord,
  StoredMappingIgnoreEntry,
  StoredProviderMappingEntry,
} from './types';

type ParsedRecordKey = { provider: Provider; anilistId: AniListId };
type ParsedCandidateKey =
  | { provider: 'sonarr'; anilistId: AniListId; providerId: TvdbId }
  | { provider: 'radarr'; anilistId: AniListId; providerId: TmdbId };

const toProviderIdRecord = (
  input: { anilistId: AniListId; updatedAt: number } & (
    | { provider: 'sonarr'; providerId: TvdbId }
    | { provider: 'radarr'; providerId: TmdbId }
  ),
): PersistedProviderMappingRecord => input;

const MANUAL_MAPPING_SORT = (a: { updatedAt: number; provider: string; anilistId: AniListId }, b: { updatedAt: number; provider: string; anilistId: AniListId }) =>
  b.updatedAt - a.updatedAt || a.provider.localeCompare(b.provider) || a.anilistId - b.anilistId;

export class ManualMappingService {
  private readonly manualMappings: PersistedMap<string, StoredProviderMappingEntry, ParsedRecordKey>;
  private readonly ignoredMappings: PersistedMap<string, StoredMappingIgnoreEntry, ParsedRecordKey>;
  private readonly rejectedCandidates: PersistedMap<string, StoredProviderMappingEntry, ParsedCandidateKey>;
  private readonly reverse = new Map<string, Set<AniListId>>();
  private initialized = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    const maps = createManualMappingPersistedMaps();
    this.manualMappings = maps.manualMappings;
    this.ignoredMappings = maps.ignoredMappings;
    this.rejectedCandidates = maps.rejectedCandidates;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([
      this.manualMappings.load(),
      this.ignoredMappings.load(),
      this.rejectedCandidates.load(),
    ]);
    this.rebuildReverse();
    this.attachWatchers();
    this.initialized = true;
  }

  public get(provider: 'sonarr', anilistId: AniListId): TvdbId | null;
  public get(provider: 'radarr', anilistId: AniListId): TmdbId | null;
  public get(provider: Provider, anilistId: AniListId): ProviderTargetId | null;
  public get(provider: Provider, anilistId: AniListId): ProviderTargetId | null {
    const entry = this.manualMappings.get(createRecordKey(provider, anilistId));
    return entry?.provider === provider ? entry.providerId : null;
  }

  public has(provider: Provider, anilistId: AniListId): boolean {
    return this.manualMappings.has(createRecordKey(provider, anilistId));
  }

  public isIgnored(provider: Provider, anilistId: AniListId): boolean {
    return this.ignoredMappings.has(createRecordKey(provider, anilistId));
  }

  public getCandidateSuppression<P extends Provider>(
    provider: P,
    anilistId: AniListId,
    providerId: ProviderIdFor<P>,
  ): 'rejected' | null {
    const key = createCandidateRecordKey(provider, anilistId, providerId);
    if (this.rejectedCandidates.has(key)) return 'rejected';
    return null;
  }

  public getLinkedAniListIds<P extends Provider>(provider: P, providerId: ProviderIdFor<P>): AniListId[] {
    if (!isFiniteId(providerId)) return [];
    const bucket = this.reverse.get(createReverseLookupKey(provider, providerId));
    if (!bucket) return [];
    return [...bucket];
  }

  public async set<P extends Provider>(provider: P, anilistId: AniListId, providerId: ProviderIdFor<P>): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const entry = { ...parseProviderIdentity(provider, providerId), updatedAt: Date.now() };

      const prev = this.manualMappings.get(key);
      if (prev) this.removeReverse(prev.provider, prev.providerId, anilistId);

      // Clear conflicting ignore.
      this.ignoredMappings.delete(key);

      const candidateKey = createCandidateRecordKey(provider, anilistId, providerId);
      this.rejectedCandidates.delete(candidateKey);

      this.manualMappings.set(key, entry);
      this.addReverse(provider, providerId, anilistId);

      await Promise.all([
        this.manualMappings.persist(),
        this.ignoredMappings.persist(),
        this.rejectedCandidates.persist(),
      ]);
    });
  }

  public async clear(provider: Provider, anilistId: AniListId): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);
      const prev = this.manualMappings.get(key);
      if (prev) this.removeReverse(prev.provider, prev.providerId, anilistId);
      this.manualMappings.delete(key);
      await this.manualMappings.persist();
    });
  }

  public async setIgnore(provider: Provider, anilistId: AniListId): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createRecordKey(provider, anilistId);

      // Clear conflicting manual mapping.
      const manualMapping = this.manualMappings.get(key);
      if (manualMapping) {
        this.removeReverse(manualMapping.provider, manualMapping.providerId, anilistId);
        this.manualMappings.delete(key);
      }

      this.ignoredMappings.set(key, { provider, updatedAt: Date.now() });

      await Promise.all([
        this.manualMappings.persist(),
        this.ignoredMappings.persist(),
      ]);
    });
  }

  public async clearIgnore(provider: Provider, anilistId: AniListId): Promise<void> {
    await this.enqueueWrite(async () => {
      this.ignoredMappings.delete(createRecordKey(provider, anilistId));
      await this.ignoredMappings.persist();
    });
  }

  public async setRejectedCandidate<P extends Provider>(
    provider: P,
    anilistId: AniListId,
    providerId: ProviderIdFor<P>,
  ): Promise<void> {
    await this.setCandidateSuppression(provider, anilistId, providerId);
  }

  public async clearRejectedCandidate<P extends Provider>(
    provider: P,
    anilistId: AniListId,
    providerId: ProviderIdFor<P>,
  ): Promise<void> {
    await this.clearCandidateSuppression(provider, anilistId, providerId);
  }

  public list(provider?: Provider): PersistedProviderMappingRecord[] {
    const entries = this.manualMappings.list<PersistedProviderMappingRecord>(
      (_key, entry, parsed) => entry.provider === 'sonarr'
        ? toProviderIdRecord({
            anilistId: parsed.anilistId,
            provider: entry.provider,
            providerId: entry.providerId,
            updatedAt: entry.updatedAt,
          })
        : toProviderIdRecord({
            anilistId: parsed.anilistId,
            provider: entry.provider,
            providerId: entry.providerId,
            updatedAt: entry.updatedAt,
          }),
      this.providerFilter(provider),
    );
    entries.sort(MANUAL_MAPPING_SORT);
    return entries;
  }

  public listIgnores(provider?: Provider): PersistedMappingIgnoreRecord[] {
    const entries = this.ignoredMappings.list<PersistedMappingIgnoreRecord>(
      (_key, entry, parsed) => ({
        anilistId: parsed.anilistId,
        provider: parsed.provider,
        updatedAt: entry.updatedAt,
      }),
      this.providerFilter(provider),
    );
    entries.sort(MANUAL_MAPPING_SORT);
    return entries;
  }

  public listRejectedCandidates(provider?: Provider): PersistedProviderMappingRecord[] {
    return this.listCandidateSuppressions(this.rejectedCandidates, provider);
  }

  public async clearAll(provider?: Provider): Promise<void> {
    await this.enqueueWrite(async () => {
      if (!provider) {
        await Promise.all([
          this.manualMappings.resetStorage(),
          this.ignoredMappings.resetStorage(),
          this.rejectedCandidates.resetStorage(),
        ]);
        this.reverse.clear();
        return;
      }

      const prefix = `${provider}:`;
      await Promise.all([
        this.manualMappings.deleteByPrefix(prefix),
        this.ignoredMappings.deleteByPrefix(prefix),
        this.rejectedCandidates.deleteByPrefix(prefix),
      ]);
      this.rebuildReverse();
    });
  }

  private listCandidateSuppressions(
    source: PersistedMap<string, StoredProviderMappingEntry, ParsedCandidateKey>,
    provider?: Provider,
  ): PersistedProviderMappingRecord[] {
    const entries = source.list<PersistedProviderMappingRecord>(
      (_key, entry, parsed) => parsed.provider === 'sonarr'
        ? toProviderIdRecord({
            anilistId: parsed.anilistId,
            provider: parsed.provider,
            providerId: parsed.providerId,
            updatedAt: entry.updatedAt,
          })
        : toProviderIdRecord({
            anilistId: parsed.anilistId,
            provider: parsed.provider,
            providerId: parsed.providerId,
            updatedAt: entry.updatedAt,
          }),
      this.providerFilter(provider),
    );
    entries.sort(MANUAL_MAPPING_SORT);
    return entries;
  }

  private providerFilter(provider: Provider | undefined): ((parsed: { provider: Provider }) => boolean) | undefined {
    if (!provider) return undefined;
    return (parsed) => parsed.provider === provider;
  }

  private async setCandidateSuppression<P extends Provider>(
    provider: P,
    anilistId: AniListId,
    providerId: ProviderIdFor<P>,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const key = createCandidateRecordKey(provider, anilistId, providerId);
      const entry = { ...parseProviderIdentity(provider, providerId), updatedAt: Date.now() };

      this.rejectedCandidates.delete(key);
      this.rejectedCandidates.set(key, entry);

      await this.rejectedCandidates.persist();
    });
  }

  private async clearCandidateSuppression<P extends Provider>(
    provider: P,
    anilistId: AniListId,
    providerId: ProviderIdFor<P>,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      this.rejectedCandidates.delete(createCandidateRecordKey(provider, anilistId, providerId));
      await this.rejectedCandidates.persist();
    });
  }

  private attachWatchers(): void {
    const rebuildAll = async () => {
      await Promise.all([
        this.manualMappings.load(),
        this.ignoredMappings.load(),
        this.rejectedCandidates.load(),
      ]);
      this.rebuildReverse();
    };

    this.manualMappings.attachWatcher(() => void rebuildAll());
    this.ignoredMappings.attachWatcher(() => void rebuildAll());
    this.rejectedCandidates.attachWatcher(() => void rebuildAll());
  }

  private rebuildReverse(): void {
    this.reverse.clear();
    for (const [key, entry] of this.manualMappings.entries()) {
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

  private addReverse(provider: Provider, providerId: ProviderTargetId, anilistId: AniListId): void {
    const reverseKey = createReverseLookupKey(provider, providerId);
    const bucket = this.reverse.get(reverseKey);
    if (bucket) {
      bucket.add(anilistId);
      return;
    }
    this.reverse.set(reverseKey, new Set([anilistId]));
  }

  private removeReverse(provider: Provider, providerId: ProviderTargetId, anilistId: AniListId): void {
    const reverseKey = createReverseLookupKey(provider, providerId);
    const bucket = this.reverse.get(reverseKey);
    if (!bucket) return;
    bucket.delete(anilistId);
    if (bucket.size === 0) this.reverse.delete(reverseKey);
  }
}
