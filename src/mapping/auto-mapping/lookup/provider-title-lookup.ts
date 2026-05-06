/** Provider title lookup clients used by auto-mapping. */
// src/mapping/auto-mapping/lookup/provider-title-lookup.ts

import type { TtlCache } from "@/shared/cache/ttl-cache";
import PQueue from "p-queue";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { SonarrClient } from "@/providers/sonarr/client";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type Provider,
	type ProviderCredentials,
	type RadarrLookupMovie,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { ProviderExternalId } from "@/mapping/types";
import { normalizeError } from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import { priorityValue } from "@/shared/utils/request-priority";
import { logger } from "@/shared/utils/logger";
import type { TitleSearchTerm } from "@/mapping/auto-mapping/title/title-search";
import { TITLE_LOOKUP_CACHE_TTL } from "./lookup.cache";

export interface ProviderTitleResult {
	title: string;
	year?: number | undefined;
	genres?: string[] | undefined;
}

export interface TitleLookupOptions {
	forceNetwork?: boolean;
	priority?: RequestPriority;
}

export type TitleLookupCaches<TResult> = TtlCache<TResult[]>;

export interface ProviderTitleLookup<
	TResult extends ProviderTitleResult = ProviderTitleResult,
	TProviderId extends ProviderExternalId = ProviderExternalId,
> {
	readonly provider: Provider;
	reset(): Promise<void>;
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
	TProviderId extends ProviderExternalId,
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
	TProviderId extends ProviderExternalId,
>(
	config: ProviderTitleLookupConfig<TResult, TProviderId>,
): ProviderTitleLookup<TResult, TProviderId> {
	const log = logger.create(config.loggerName);
	const inflight = new Map<string, Promise<TResult[]>>();
	const queue = new PQueue({ concurrency: 5 });
	let resetGeneration = 0;

	const fetchQueuedTitleResults = async (
		term: string,
		credentials: ProviderCredentials,
		priority?: RequestPriority,
	): Promise<TResult[]> => {
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
	};

	const lookupNetwork = (
		term: TitleSearchTerm,
		credentials: ProviderCredentials,
		options: TitleLookupOptions = {},
	): Promise<TResult[]> => {
		const inflightKey =
			options.forceNetwork === true
				? `${term.canonical}:force`
				: term.canonical;
		const existing = inflight.get(inflightKey);
		if (existing) {
			log.debug(
				`lookupTitle(${term.canonical}): existing inflight found; reusing`,
			);
			return existing;
		}

		const generation = resetGeneration;
		const promise = (async (): Promise<TResult[]> => {
			try {
				const results = await fetchQueuedTitleResults(
					term.display,
					credentials,
					options.priority,
				);
				if (generation !== resetGeneration) {
					return results;
				}
				const ttl =
					results.length > 0
						? TITLE_LOOKUP_CACHE_TTL.results
						: TITLE_LOOKUP_CACHE_TTL.emptyResults;
				await config.caches.write(term.canonical, results, {
					staleMs: ttl.staleMs,
					hardMs: ttl.hardMs,
				});
				return results;
			} catch (error) {
				throw normalizeError(error);
			}
		})();

		inflight.set(inflightKey, promise);
		void promise.finally(() => {
			if (inflight.get(inflightKey) === promise) {
				inflight.delete(inflightKey);
			}
		});
		return promise;
	};

	const lookupTitle = (
		term: TitleSearchTerm,
		credentials: ProviderCredentials,
		options: TitleLookupOptions = {},
	): Promise<TResult[]> => {
		const forceNetwork = options.forceNetwork === true;
		if (forceNetwork) {
			return lookupNetwork(term, credentials, options);
		}

		return (async (): Promise<TResult[]> => {
			try {
				const cached = await config.caches.read(term.canonical);
				if (cached && !cached.stale) {
					log.debug(`lookupTitle(${term.canonical}): returning fresh cache`);
					return cached.value;
				}

				return lookupNetwork(term, credentials, options);
			} catch (error) {
				throw normalizeError(error);
			}
		})();
	};

	const lookup: ProviderTitleLookup<TResult, TProviderId> = {
		provider: config.provider,
		reset: async () => {
			resetGeneration += 1;
			inflight.clear();
			await config.caches.clear();
		},
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
			sonarrApi.lookupSeries(term, credentials),
		readProviderId: (result) => {
			const candidate = result as { tvdbId?: unknown } | null;
			return parseTvdbIdOrNull(candidate?.tvdbId);
		},
		lookupByProviderId: (tvdbId, credentials) =>
			sonarrApi.lookupSeriesByTvdbId(tvdbId, credentials),
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
