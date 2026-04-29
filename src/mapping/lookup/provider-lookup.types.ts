/** Mapping-owned lookup contracts and result shapes for provider search adapters. */
// src/mapping/lookup/provider-lookup.types.ts

import type { Provider, ProviderCredentials, ProviderId } from "@/providers";
import type { RequestPriority } from "@/shared/utils/request-priority";

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
	hit: "positive" | "negative" | "inflight" | "none";
};

export interface ProviderLookupClient<
	TCredentials = ProviderCredentials,
	TResult extends ProviderLookupResult = ProviderLookupResult,
	TTargetId extends ProviderId = ProviderId,
> {
	readonly provider: Provider;
	reset(): Promise<void>;
	readFromCache(canonical: string): Promise<ProviderLookupCacheHit<TResult>>;
	lookupExactByProviderId?(
		providerId: TTargetId,
		credentials: TCredentials,
	): Promise<TResult | null>;
	lookup(
		canonicalKey: string,
		rawTerm: string,
		credentials: TCredentials,
		options?: ProviderLookupOptions,
	): Promise<TResult[]>;
	getProviderId(result: unknown): TTargetId | null;
}
