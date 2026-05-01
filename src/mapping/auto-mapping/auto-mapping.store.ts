/** Mapping-owned persisted auto-mapping outcomes for each provider and AniList entry. */
// src/mapping/auto-mapping/auto-mapping.store.ts

import { storage } from '@wxt-dev/storage';
import PQueue from 'p-queue';
import { parseAniListIdOrNull, type AniListId } from '@/anilist';
import type { Provider, ProviderId } from '@/providers';
import type { AcceptedMappingEvidence } from '@/mapping/types';
import type { AutoMappingRecord } from './types';

type AutoMappingTtl = {
  hardMs: number;
};

type StoredAutoMappingRecord = AutoMappingRecord & {
  expiresAt: number;
};

const AUTO_MAPPING_STORAGE_KEY = 'local:autoMappings:v2';

export const MAPPED_AUTO_MAPPING_TTL = {
  hardMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const UNRESOLVED_AUTO_MAPPING_TTL = {
  hardMs: 48 * 60 * 60 * 1000,
} as const;

const autoMappingStorage = storage.defineItem<Record<string, StoredAutoMappingRecord>>(
  AUTO_MAPPING_STORAGE_KEY,
  {
    fallback: {},
    version: 1,
  },
);

// Composite key format stays local to this store: "provider:anilistId".
const createAutoMappingKey = (provider: Provider, anilistId: AniListId): string => `${provider}:${anilistId}`;

const parseAutoMappingKey = (key: string): { provider: Provider; anilistId: AniListId } | null => {
  const [provider, rawAniListId] = key.split(':');
  if ((provider !== 'sonarr' && provider !== 'radarr') || !rawAniListId) {
    return null;
  }
  if (!/^\d+$/.test(rawAniListId)) {
    return null;
  }
  const anilistId = parseAniListIdOrNull(Number(rawAniListId));
  if (anilistId === null) {
    return null;
  }
  return { provider, anilistId };
};

const acceptedEvidenceEquals = (
  left: AcceptedMappingEvidence,
  right: AcceptedMappingEvidence,
): boolean => (
  left.source === right.source &&
  left.reason === right.reason &&
  left.successfulTitle === right.successfulTitle
);

const autoMappingEquals = (left: AutoMappingRecord, right: AutoMappingRecord): boolean => {
  if (left.state !== right.state || left.updatedAt !== right.updatedAt) {
    return false;
  }

  switch (left.state) {
    case 'mapped': {
      return (
        right.state === 'mapped' &&
        left.providerId === right.providerId &&
        acceptedEvidenceEquals(left.acceptedEvidence, right.acceptedEvidence)
      );
    }
    default: {
      return right.state === left.state;
    }
  }
};

const sanitizeStoredRecord = (value: StoredAutoMappingRecord): StoredAutoMappingRecord | null => {
  if (value.state === 'mapped') {
    return {
      state: 'mapped',
      providerId: value.providerId as ProviderId,
      acceptedEvidence: value.acceptedEvidence,
      updatedAt: value.updatedAt,
      expiresAt: value.expiresAt,
    };
  }

  if (value.state === 'unresolved' || value.state === 'ambiguous') {
    return {
      state: value.state,
      updatedAt: value.updatedAt,
      expiresAt: value.expiresAt,
    };
  }

  return null;
};

export class AutoMappingStore {
  private readonly records = new Map<string, StoredAutoMappingRecord>();
  private readonly writeQueue = new PQueue({ concurrency: 1 });
  private initPromise: Promise<void> | null = null;
  private hasPendingExpiryCleanup = false;

  public async get(provider: Provider, anilistId: AniListId): Promise<AutoMappingRecord | null> {
    await this.ensureLoaded();
    const key = createAutoMappingKey(provider, anilistId);
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

  public async list(provider?: Provider): Promise<Array<AutoMappingRecord & { provider: Provider; anilistId: AniListId }>> {
    return this.runWrite(async () => {
      await this.ensureLoaded();
      const now = Date.now();
      let pruned = false;
      const entries: Array<AutoMappingRecord & { provider: Provider; anilistId: AniListId }> = [];

      for (const [key, entry] of this.records.entries()) {
        const parsed = parseAutoMappingKey(key);
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
    });
  }

  public async set<TState extends AutoMappingRecord['state']>(
    provider: Provider,
    anilistId: AniListId,
    record: Omit<Extract<AutoMappingRecord, { state: TState }>, 'updatedAt'>,
    ttl: AutoMappingTtl,
  ): Promise<boolean> {
    return this.runWrite(async () => {
      await this.ensureLoaded();
      const key = createAutoMappingKey(provider, anilistId);
      const previous = this.records.get(key);
      const nextRecord = {
        ...record,
        updatedAt: this.resolveUpdatedAt(previous, record),
      } as AutoMappingRecord;
      const now = Date.now();
      const next: StoredAutoMappingRecord = {
        ...nextRecord,
        expiresAt: now + ttl.hardMs,
      };
      const changed = !previous || !autoMappingEquals(this.toPublicRecord(previous), nextRecord);

      this.records.set(key, next);
      await this.persist();
      return changed;
    });
  }

  public async delete(provider: Provider, anilistId: AniListId): Promise<boolean> {
    return this.runWrite(async () => {
      await this.ensureLoaded();
      const deleted = this.records.delete(createAutoMappingKey(provider, anilistId));
      if (deleted) {
        await this.persist();
      }
      return deleted;
    });
  }

  public async clear(provider?: Provider): Promise<boolean> {
    return this.runWrite(async () => {
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
        const parsed = parseAutoMappingKey(key);
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
    });
  }

  private runWrite<T>(write: () => Promise<T>): Promise<T> {
    return this.writeQueue.add(write);
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.load();
    }
    await this.initPromise;
  }

  private async load(): Promise<void> {
    const stored = await autoMappingStorage.getValue();
    this.records.clear();
    for (const [key, value] of Object.entries(stored ?? {})) {
      if (!parseAutoMappingKey(key)) {
        continue;
      }
      const sanitized = sanitizeStoredRecord(value);
      if (sanitized) {
        this.records.set(key, sanitized);
      }
    }
  }

  private async persist(): Promise<void> {
    const next: Record<string, StoredAutoMappingRecord> = {};
    for (const [key, value] of this.records.entries()) {
      next[key] = value;
    }
    await autoMappingStorage.setValue(next);
    this.hasPendingExpiryCleanup = false;
  }

  private resolveUpdatedAt(
    previous: StoredAutoMappingRecord | undefined,
    next: Omit<AutoMappingRecord, 'updatedAt'>,
  ): number {
    if (!previous) {
      return Date.now();
    }

    const comparableNext = { ...next, updatedAt: previous.updatedAt } as AutoMappingRecord;
    return autoMappingEquals(this.toPublicRecord(previous), comparableNext) ? previous.updatedAt : Date.now();
  }

  private toPublicRecord(record: StoredAutoMappingRecord): AutoMappingRecord {
    switch (record.state) {
      case 'mapped': {
        return {
          state: 'mapped',
          providerId: record.providerId,
          acceptedEvidence: record.acceptedEvidence,
          updatedAt: record.updatedAt,
        };
      }
      default: {
        return {
          state: record.state,
          updatedAt: record.updatedAt,
        };
      }
    }
  }
}
