/** Provider title lookup clients used by auto-mapping. */
// src/mapping/auto-mapping/lookup/provider-title-lookup.ts

import type { TtlCache } from "@/shared/cache/ttl-cache";
import PQueue from "p-queue";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { SonarrClient } from "@/providers/clients/sonarr.client";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type Provider,
	type ProviderCredentials,
	type ProviderId,
	type RadarrLookupMovie,
	type SonarrLookupSeries,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import { normalizeError } from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import { incrementCounter, timeAsync } from "@/debug/metrics";
import { priorityValue } from "@/shared/utils/request-priority";
import { logger } from "@/shared/utils/logger";
import type { TitleSearchTerm } from "@/mapping/auto-mapping/title/title-search";
import { TITLE_LOOKUP_CACHE_TTL } from "./lookup.cache";

const TITLE_LOOKUP_LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2000, 5000];

export interface ProviderTitleResult {
	title: string;
	year?: number;
	genres?: string[];
}

export interface TitleLookupOptions {
	forceNetwork?: boolean;
	priority?: RequestPriority;
}

export type CachedTitleLookup<TResult> = {
	results: TResult[];
	hit: "positive" | "negative" | "inflight" | "none";
};

export type TitleLookupCaches<TResult> = {
	positive: TtlCache<TResult[]>;
	negative: TtlCache<boolean>;
};

export interface ProviderTitleLookup<
	TResult extends ProviderTitleResult = ProviderTitleResult,
	TProviderId extends ProviderId = ProviderId,
> {
	readonly provider: Provider;
	reset(): Promise<void>;
	readCachedTitleLookup(canonical: string): Promise<CachedTitleLookup<TResult>>;
	lookupByProviderId?(
		providerId: TProviderId,
		credentials: ProviderCredentials,
	): Promise<TResult | null>;
	lookupTitle(
		term: TitleSearchTerm,
		credentials: ProviderCredentials,
		options?: TitleLookupOptions,
	): Promise<TResult[]>;
	readProviderId(result: unknown): TProviderId | null;
}

type ProviderTitleLookupConfig<
	TResult extends ProviderTitleResult,
	TProviderId extends ProviderId,
> = {
	provider: Provider;
	loggerName: string;
	caches: TitleLookupCaches<TResult>;
	fetchTitleResults: (
		term: string,
		credentials: ProviderCredentials,
	) => Promise<TResult[]>;
	readProviderId: (result: unknown) => TProviderId | null;
	lookupByProviderId?: (
		providerId: TProviderId,
		credentials: ProviderCredentials,
	) => Promise<TResult | null>;
};

export function createProviderTitleLookup<
	TResult extends ProviderTitleResult,
	TProviderId extends ProviderId,
>(
	config: ProviderTitleLookupConfig<TResult, TProviderId>,
): ProviderTitleLookup<TResult, TProviderId> {
	const log = logger.create(config.loggerName);
	const inflight = new Map<string, Promise<TResult[]>>();
	const queue = new PQueue({ concurrency: 5 });

	const fetchQueuedTitleResults = async (
		term: string,
		credentials: ProviderCredentials,
		priority?: RequestPriority,
	): Promise<TResult[]> => {
		incrementCounter("mapping.lookup.network_miss");
		return timeAsync(
			"mapping.lookup.latency",
			TITLE_LOOKUP_LATENCY_BUCKETS,
			async () => {
				try {
					if (import.meta.env.DEV) {
						log.debug?.(
							`lookup:queue term='${term}' priority=${priority ?? "normal"} prioValue=${priorityValue(priority)}`,
						);
					}
					const results = await (queue.add(
						() => config.fetchTitleResults(term, credentials),
						{ priority: priorityValue(priority) },
					) as Promise<TResult[]>);
					log.debug(
						`fetchQueuedTitleResults: term='${term}' resultCount=${results.length}`,
					);
					return results;
				} catch (error) {
					throw normalizeError(error);
				}
			},
		);
	};

	const readCachedTitleLookup = async (
		canonical: string,
	): Promise<CachedTitleLookup<TResult>> => {
		if (!canonical) {
			return { results: [], hit: "none" };
		}

		const inflightLookup = inflight.get(canonical);
		if (inflightLookup) {
			incrementCounter("mapping.lookup.inflight_reuse");
			log.debug(
				`readCachedTitleLookup(${canonical}): reusing inflight promise`,
			);
			const results = await inflightLookup;
			return { results, hit: "inflight" };
		}

		const positive = await config.caches.positive.read(canonical);
		if (positive) {
			incrementCounter("mapping.lookup.cache_hit");
			log.debug(
				`readCachedTitleLookup(${canonical}): positive cache hit (stale=${String(positive.stale)})`,
			);
			return { results: positive.value, hit: "positive" };
		}

		const negative = await config.caches.negative.read(canonical);
		if (negative) {
			incrementCounter("mapping.lookup.negative_cache_hit");
			log.debug(
				`readCachedTitleLookup(${canonical}): negative cache hit (stale=${String(negative.stale)})`,
			);
			return { results: [], hit: "negative" };
		}

		return { results: [], hit: "none" };
	};

	const lookupTitle = (
		term: TitleSearchTerm,
		credentials: ProviderCredentials,
		options: TitleLookupOptions = {},
	): Promise<TResult[]> => {
		const forceNetwork = options.forceNetwork === true;
		const existing = inflight.get(term.canonical);
		if (existing) {
			log.debug(
				`lookupTitle(${term.canonical}): existing inflight found; reusing`,
			);
			incrementCounter("mapping.lookup.inflight_reuse");
			return existing;
		}

		const promise = (async (): Promise<TResult[]> => {
			try {
				if (!forceNetwork) {
					const positiveHit = await config.caches.positive.read(term.canonical);
					if (positiveHit && !positiveHit.stale) {
						incrementCounter("mapping.lookup.cache_hit");
						log.debug(
							`lookupTitle(${term.canonical}): returning fresh positive cache`,
						);
						return positiveHit.value;
					}

					const negativeHit = await config.caches.negative.read(term.canonical);
					if (negativeHit && !negativeHit.stale) {
						incrementCounter("mapping.lookup.negative_cache_hit");
						log.debug(
							`lookupTitle(${term.canonical}): returning fresh negative cache`,
						);
						return [];
					}
				}

				const results = await fetchQueuedTitleResults(
					term.display,
					credentials,
					options.priority,
				);
				if (results.length > 0) {
					await config.caches.positive.write(term.canonical, results, {
						staleMs: TITLE_LOOKUP_CACHE_TTL.positive.staleMs,
						hardMs: TITLE_LOOKUP_CACHE_TTL.positive.hardMs,
					});
					await config.caches.negative.remove(term.canonical);
				} else {
					await config.caches.negative.write(term.canonical, true, {
						staleMs: TITLE_LOOKUP_CACHE_TTL.negative.staleMs,
						hardMs: TITLE_LOOKUP_CACHE_TTL.negative.hardMs,
					});
					await config.caches.positive.remove(term.canonical);
				}
				return results;
			} catch (error) {
				throw normalizeError(error);
			} finally {
				inflight.delete(term.canonical);
			}
		})();

		inflight.set(term.canonical, promise);
		return promise;
	};

	const lookup: ProviderTitleLookup<TResult, TProviderId> = {
		provider: config.provider,
		reset: async () => {
			inflight.clear();
			await Promise.all([
				config.caches.positive.clear(),
				config.caches.negative.clear(),
			]);
		},
		readCachedTitleLookup,
		lookupTitle,
		readProviderId: config.readProviderId,
	};

	if (config.lookupByProviderId) {
		lookup.lookupByProviderId = config.lookupByProviderId;
	}

	return lookup;
}

export function createSonarrTitleLookup(
	sonarrApi: SonarrClient,
	caches: TitleLookupCaches<SonarrLookupSeries>,
): ProviderTitleLookup<SonarrLookupSeries, TvdbId> {
	return createProviderTitleLookup({
		provider: "sonarr",
		loggerName: "SonarrTitleLookup",
		caches,
		fetchTitleResults: (term, credentials) =>
			sonarrApi.lookupSeriesByTerm(term, credentials),
		readProviderId: (result) => {
			const candidate = result as { tvdbId?: unknown } | null;
			return parseTvdbIdOrNull(candidate?.tvdbId);
		},
		lookupByProviderId: (providerId, credentials) =>
			sonarrApi.lookupSeriesByTvdbId(providerId, credentials),
	});
}

export function createRadarrTitleLookup(
	radarrApi: RadarrClient,
	caches: TitleLookupCaches<RadarrLookupMovie>,
): ProviderTitleLookup<RadarrLookupMovie, TmdbId> {
	return createProviderTitleLookup({
		provider: "radarr",
		loggerName: "RadarrTitleLookup",
		caches,
		fetchTitleResults: (term, credentials) =>
			radarrApi.lookupMovieByTerm(term, credentials),
		readProviderId: (result) => {
			const candidate = result as { tmdbId?: unknown } | null;
			return parseTmdbIdOrNull(candidate?.tmdbId);
		},
	});
}
