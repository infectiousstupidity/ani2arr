import type { MappingExternalIdKind, MappingProvider, RequestPriority } from '@/shared/types';

export interface LookupClientCredentials {
  url: string;
  apiKey: string;
}

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
  TCredentials = LookupClientCredentials,
  TResult extends ProviderLookupResult = ProviderLookupResult,
> {
  readonly provider: MappingProvider;
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
