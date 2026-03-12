import type { TtlCache } from '@/cache';
import type { ExtensionOptions, RequestPriority } from '@/shared/types';

export interface LibraryStatusOptions {
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
}

export interface LibraryTitleIndexer<TLeanEntry> {
  reset(): void;
  bulkIndex(list: TLeanEntry[]): void;
  reindex(list: TLeanEntry[]): void;
}

export interface LibraryCaches<TLeanEntry> {
  lean: TtlCache<TLeanEntry[]>;
}

export interface LibraryStore<TLeanEntry, TFullEntry> {
  getLeanList(): Promise<TLeanEntry[]>;
  refreshCache(optionsOverride?: ExtensionOptions): Promise<TLeanEntry[]>;
  addToCache(entry: TFullEntry): Promise<void>;
  removeFromCache(externalId: number): Promise<void>;
}

export type LibraryMutationEmitter<TPayload> = (payload: TPayload) => Promise<void> | void;
