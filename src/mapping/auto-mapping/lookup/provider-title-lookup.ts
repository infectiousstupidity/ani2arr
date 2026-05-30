/** Provider title lookup clients used by auto-mapping. */
// src/mapping/auto-mapping/lookup/provider-title-lookup.ts

import type { TtlCache } from "@/shared/cache/ttl-cache";
import PQueue from "p-queue";
import type { RadarrClient } from "@/providers/radarr/client";
import type { SonarrClient } from "@/providers/sonarr/client";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type Provider,
	type ProviderCredentials,
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
	tvdbId?: number | undefined;
	tmdbId?: number | undefined;
	[key: string]: unknown; // Allows safe passthrough of raw provider fields
}

export interface TitleLookupOptions {
	forceNetwork?: boolean;
	priority?: RequestPriority;
}

export interface ProviderTitleLookup {
	readonly provider: Provider;
	reset(): Promise<void>;
	lookupByProviderId?(
		providerId: ProviderExternalId,
		credentials: ProviderCredentials,
	): Promise<ProviderTitleResult | null>;
	lookupTitle(
		term: TitleSearchTerm,
		credentials: ProviderCredentials,
		options?: TitleLookupOptions,
	): Promise<ProviderTitleResult[]>;
	readProviderId(result: ProviderTitleResult): ProviderExternalId | null;
}

type ProviderTitleLookupConfig = {
	provider: Provider;
	loggerName: string;
	caches: TtlCache<ProviderTitleResult[]>;
	fetchTitleResults: (
		term: string,
		credentials: ProviderCredentials,
	) => Promise<ProviderTitleResult[]>;
	readProviderId: (result: ProviderTitleResult) => ProviderExternalId | null;
	lookupByProviderId?: (
		providerId: ProviderExternalId,
		credentials: ProviderCredentials,
	) => Promise<ProviderTitleResult | null>;
};

export function createProviderTitleLookup(
	config: ProviderTitleLookupConfig,
): ProviderTitleLookup {
	const log = logger.create(config.loggerName);
	const inflight = new Map<string, Promise<ProviderTitleResult[]>>();
	const queue = new PQueue({ concurrency: 5 });
	let resetGeneration = 0;

	const fetchQueuedTitleResults = async (
		term: string,
		credentials: ProviderCredentials,
		priority?: RequestPriority,
	): Promise<ProviderTitleResult[]> => {
		try {
			return await (queue.add(
				() => config.fetchTitleResults(term, credentials),
				{ priority: priorityValue(priority) },
			) as Promise<ProviderTitleResult[]>);
		} catch (error) {
			throw normalizeError(error);
		}
	};

	const lookupNetwork = (
		term: TitleSearchTerm,
		credentials: ProviderCredentials,
		options: TitleLookupOptions = {},
	): Promise<ProviderTitleResult[]> => {
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
		const promise = (async (): Promise<ProviderTitleResult[]> => {
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
	): Promise<ProviderTitleResult[]> => {
		const forceNetwork = options.forceNetwork === true;
		if (forceNetwork) {
			return lookupNetwork(term, credentials, options);
		}

		return (async (): Promise<ProviderTitleResult[]> => {
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

	const lookup: ProviderTitleLookup = {
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
	caches: TtlCache<ProviderTitleResult[]>,
): ProviderTitleLookup {
	return createProviderTitleLookup({
		provider: "sonarr",
		loggerName: "SonarrTitleLookup",
		caches,
		fetchTitleResults: async (term, credentials) => {
			return (await sonarrApi.lookupSeries(
				term,
				credentials,
			)) as ProviderTitleResult[];
		},
		readProviderId: (result) => parseTvdbIdOrNull(result.tvdbId),
		lookupByProviderId: async (providerId, credentials) => {
			const tvdbId = parseTvdbIdOrNull(Number(providerId));
			if (tvdbId === null) {
				return null;
			}

			const result = await sonarrApi.lookupSeriesByTvdbId(tvdbId, credentials);
			return result as ProviderTitleResult | null;
		},
	});
}

export function createRadarrTitleLookup(
	radarrApi: RadarrClient,
	caches: TtlCache<ProviderTitleResult[]>,
): ProviderTitleLookup {
	return createProviderTitleLookup({
		provider: "radarr",
		loggerName: "RadarrTitleLookup",
		caches,
		fetchTitleResults: async (term, credentials) => {
			return (await radarrApi.lookupMovies(
				term,
				credentials,
			)) as ProviderTitleResult[];
		},
		readProviderId: (result) => parseTmdbIdOrNull(result.tmdbId),
		lookupByProviderId: async (providerId, credentials) => {
			const tmdbId = parseTmdbIdOrNull(Number(providerId));
			if (tmdbId === null) {
				return null;
			}

			const result = await radarrApi.lookupMovieByTmdbId(tmdbId, credentials);
			return result as ProviderTitleResult | null;
		},
	});
}
