/** Mapping-owned persisted resolver outcomes for each provider and AniList entry. */
// src/mapping/resolver-state/resolver-state.store.ts

import { storage } from '@wxt-dev/storage';
import type { Provider } from '@/providers';
import { STORAGE_KEYS } from '@/storage/keys';
import type { ResolverStateRecord } from '@/mapping/types';

type ResolverStateTtl = {
  staleMs: number;
  hardMs: number;
};

type StoredResolverStateRecord = ResolverStateRecord & {
  staleAt: number;
  expiresAt: number;
};

const resolverStateStorage = storage.defineItem<Record<string, StoredResolverStateRecord>>(
  STORAGE_KEYS.mappingResolverState,
  {
    fallback: {},
    version: 1,
  },
);

// Composite key format stays local to this store: "provider:anilistId".
const createResolverStateKey = (provider: Provider, anilistId: number): string => `${provider}:${anilistId}`;

const parseResolverStateKey = (key: string): { provider: Provider; anilistId: number } | null => {
  const [provider, rawAniListId] = key.split(':');
  if ((provider !== 'sonarr' && provider !== 'radarr') || !rawAniListId) {
    return null;
  }
  const anilistId = Number.parseInt(rawAniListId, 10);
  if (!Number.isFinite(anilistId)) {
    return null;
  }
  return { provider, anilistId };
};

const resolverStateEquals = (left: ResolverStateRecord, right: ResolverStateRecord): boolean => {
  if (left.state !== right.state || left.updatedAt !== right.updatedAt) {
    return false;
  }

  switch (left.state) {
    case 'mapped': {
      return (
        right.state === 'mapped' &&
        left.providerId === right.providerId &&
        left.source === right.source &&
        left.successfulSynonym === right.successfulSynonym
      );
    }
    case 'verification-failed': {
      return (
        right.state === 'verification-failed' &&
        left.providerId === right.providerId &&
        left.source === right.source &&
        left.title === right.title &&
        left.successfulSynonym === right.successfulSynonym
      );
    }
    default: {
      return right.state === left.state && left.title === right.title;
    }
  }
};

export class ResolverStateStore {
  private readonly records = new Map<string, StoredResolverStateRecord>();
  private initPromise: Promise<void> | null = null;
  private hasPendingExpiryCleanup = false;

  public async get(provider: Provider, anilistId: number): Promise<ResolverStateRecord | null> {
    await this.ensureLoaded();
    const key = createResolverStateKey(provider, anilistId);
    const entry = this.records.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.records.delete(key);
      this.hasPendingExpiryCleanup = true;
      return null;
    }

    return this.toPublicRecord(entry);
  }

  public async list(provider?: Provider): Promise<Array<ResolverStateRecord & { provider: Provider; anilistId: number }>> {
    await this.ensureLoaded();
    const now = Date.now();
    let pruned = false;
    const entries: Array<ResolverStateRecord & { provider: Provider; anilistId: number }> = [];

    for (const [key, entry] of this.records.entries()) {
      const parsed = parseResolverStateKey(key);
      if (!parsed) {
        continue;
      }
      if (provider && parsed.provider !== provider) {
        continue;
      }
      if (now >= entry.expiresAt) {
        this.records.delete(key);
        pruned = true;
        continue;
      }
      entries.push({
        provider: parsed.provider,
        anilistId: parsed.anilistId,
        ...this.toPublicRecord(entry),
      });
    }

    if (pruned) {
      this.hasPendingExpiryCleanup = true;
    }

    if (this.hasPendingExpiryCleanup) {
      await this.persist();
    }

    return entries;
  }

  public async set<TState extends ResolverStateRecord['state']>(
    provider: Provider,
    anilistId: number,
    record: Omit<Extract<ResolverStateRecord, { state: TState }>, 'updatedAt'>,
    ttl: ResolverStateTtl,
  ): Promise<boolean> {
    await this.ensureLoaded();
    const key = createResolverStateKey(provider, anilistId);
    const previous = this.records.get(key);
    const nextRecord = {
      ...record,
      updatedAt: this.resolveUpdatedAt(previous, record),
    } as ResolverStateRecord;
    const now = Date.now();
    const next: StoredResolverStateRecord = {
      ...nextRecord,
      staleAt: now + ttl.staleMs,
      expiresAt: now + ttl.hardMs,
    };
    const changed = !previous || !resolverStateEquals(this.toPublicRecord(previous), nextRecord);

    this.records.set(key, next);
    await this.persist();
    return changed;
  }

  public async delete(provider: Provider, anilistId: number): Promise<boolean> {
    await this.ensureLoaded();
    const deleted = this.records.delete(createResolverStateKey(provider, anilistId));
    if (deleted) {
      await this.persist();
    }
    return deleted;
  }

  public async clear(provider?: Provider): Promise<boolean> {
    await this.ensureLoaded();

    if (!provider) {
      if (this.records.size === 0) {
        return false;
      }
      this.records.clear();
      await this.persist();
      return true;
    }

    let changed = false;
    const keysToDelete: string[] = [];
    for (const key of this.records.keys()) {
      const parsed = parseResolverStateKey(key);
      if (parsed?.provider === provider) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.records.delete(key);
      changed = true;
    }

    if (changed) {
      await this.persist();
    }
    return changed;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.load();
    }
    await this.initPromise;
  }

  private async load(): Promise<void> {
    const stored = await resolverStateStorage.getValue();
    this.records.clear();
    for (const [key, value] of Object.entries(stored ?? {})) {
      if (!parseResolverStateKey(key)) {
        continue;
      }
      this.records.set(key, value);
    }
  }

  private async persist(): Promise<void> {
    const next: Record<string, StoredResolverStateRecord> = {};
    for (const [key, value] of this.records.entries()) {
      next[key] = value;
    }
    await resolverStateStorage.setValue(next);
    this.hasPendingExpiryCleanup = false;
  }

  private resolveUpdatedAt(
    previous: StoredResolverStateRecord | undefined,
    next: Omit<ResolverStateRecord, 'updatedAt'>,
  ): number {
    if (!previous) {
      return Date.now();
    }

    const comparableNext = { ...next, updatedAt: previous.updatedAt } as ResolverStateRecord;
    return resolverStateEquals(this.toPublicRecord(previous), comparableNext) ? previous.updatedAt : Date.now();
  }

  private toPublicRecord(record: StoredResolverStateRecord): ResolverStateRecord {
    switch (record.state) {
      case 'mapped': {
        return {
          state: 'mapped',
          providerId: record.providerId,
          source: record.source,
          ...(record.successfulSynonym ? { successfulSynonym: record.successfulSynonym } : {}),
          updatedAt: record.updatedAt,
        };
      }
      case 'verification-failed': {
        return {
          state: 'verification-failed',
          providerId: record.providerId,
          source: record.source,
          ...(record.title ? { title: record.title } : {}),
          ...(record.successfulSynonym ? { successfulSynonym: record.successfulSynonym } : {}),
          updatedAt: record.updatedAt,
        };
      }
      default: {
        return {
          state: record.state,
          ...(record.title ? { title: record.title } : {}),
          updatedAt: record.updatedAt,
        };
      }
    }
  }
}
