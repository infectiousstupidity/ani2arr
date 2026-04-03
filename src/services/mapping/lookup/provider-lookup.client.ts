/** Provider lookup client types for provider search adapters and cache behavior. */
// src/services/mapping/lookup/provider-lookup.client.ts

import type { MappingExternalIdKind } from '@/shared/types';
import type { Provider, ProviderCredentials } from '@/shared/types/providers';
import type { RequestPriority } from '@/shared/types/request-scheduling';

export interface ProviderLookupResult {
  title: string;
  year?: number;
  genres?: string[];
}

export interface ProviderLookupOptions {
  forceNetwork?: boolean;
  priority?: RequestPriority;
}

export type ProviderLookupCacheHit<TResult> = {
  results: TResult[];
  hit: 'positive' | 'negative' | 'inflight' | 'none';
};

export interface ProviderLookupClient<
  TCredentials = ProviderCredentials,
  TResult extends ProviderLookupResult = ProviderLookupResult,
> {
  readonly provider: Provider;
  readonly externalIdKind: MappingExternalIdKind;
  reset(): Promise<void>;
  readFromCache(canonical: string): Promise<ProviderLookupCacheHit<TResult>>;
  lookup(
    canonicalKey: string,
    rawTerm: string,
    credentials: TCredentials,
    options?: ProviderLookupOptions,
  ): Promise<TResult[]>;
  getExternalId(result: unknown): number | null;
}
