/** Sonarr provider-domain library snapshot cache and TVDB lookup helpers. */
// src/providers/sonarr/library.ts

import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import {
	createTtlCache,
	type CacheHit,
	type CacheWriteOptions,
	type TtlCache,
} from "@/shared/cache/ttl-cache";
import {
	logError,
	normalizeError,
} from "@/shared/errors/error-utils";
import type { ProviderCredentials } from "../types";
import type { SonarrClient } from "./client";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
	TvdbId,
} from "./types";

const CACHE_KEY = "series";
const CACHE_TTL = {
	normal: { staleMs: 60 * 60 * 1000, hardMs: 24 * 60 * 60 * 1000 },
	error: { staleMs: 5 * 60 * 1000, hardMs: 10 * 60 * 1000 },
};

const defaultCache = createTtlCache<SonarrSeriesSnapshot[]>(
	"sonarr:series-snapshots",
);

export type LibraryUnknownReason = "library-check-failed";

export interface SonarrSeriesLibraryStatus {
	provider: "sonarr";
	providerId: TvdbId;
	isInLibrary: boolean | null;
	series?: SonarrSeriesSnapshot | SonarrSeries | SonarrLookupSeries;
	libraryUnknownReason?: LibraryUnknownReason;
}

export class SonarrLibrary {
	private readonly memoryCache = new Map<
		string,
		CacheHit<SonarrSeriesSnapshot[]>
	>();
	private readonly refreshPromises = new Map<
		string,
		Promise<SonarrSeriesSnapshot[]>
	>();
	private cacheGeneration = 0;
	private clearPromise: Promise<void> | null = null;

	public constructor(
		private readonly client: SonarrClient,
		private readonly cache: TtlCache<SonarrSeriesSnapshot[]> = defaultCache,
	) {}

	public async getSeriesSnapshots(
		credentials: ProviderCredentials,
	): Promise<SonarrSeriesSnapshot[]> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const memoryCache = this.memoryCache.get(scope);
		const now = Date.now();

		if (memoryCache && now < memoryCache.expiresAt) {
			if (now >= memoryCache.staleAt) {
				// Stale cache is good enough for status; refresh quietly for the next read.
				void this.refreshSeriesSnapshots(credentials).catch(() => {});
			}

			return memoryCache.value;
		}

		this.memoryCache.delete(scope);
		const cached = await this.cache.read(cacheKey);
		if (generation !== this.cacheGeneration) {
			return this.getSeriesSnapshots(credentials);
		}
		if (!cached) return this.refreshSeriesSnapshots(credentials);

		this.memoryCache.set(scope, cached);
		if (cached.stale) {
			// Stale cache is good enough for status; refresh quietly for the next read.
			void this.refreshSeriesSnapshots(credentials).catch(() => {});
		}

		return cached.value;
	}

	public async refreshSeriesSnapshots(
		credentials: ProviderCredentials,
	): Promise<SonarrSeriesSnapshot[]> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const existingRefresh = this.refreshPromises.get(scope);
		if (existingRefresh) return existingRefresh;

		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const refreshPromise = (async () => {
			const cached = await this.cache.read(cacheKey);
			const fallback = cached?.value ?? [];

			try {
				const series = await this.client.getAllSeries(credentials);
				const snapshots = series.map((element) =>
					toSonarrSeriesSnapshot(element),
				);

				if (generation === this.cacheGeneration) {
					await this.cache.write(cacheKey, snapshots, CACHE_TTL.normal);
					if (generation === this.cacheGeneration) {
						this.setMemoryCache(scope, snapshots, CACHE_TTL.normal);
					}
				}

				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				const ttl = {
					...CACHE_TTL.error,
					meta: { lastErrorCode: normalized.code },
				};
				if (generation === this.cacheGeneration) {
					await this.cache.write(cacheKey, fallback, ttl);
					if (generation === this.cacheGeneration) {
						this.setMemoryCache(scope, fallback, ttl);
					}
				}
				return fallback;
			}
		})();
		this.refreshPromises.set(scope, refreshPromise);

		try {
			return await refreshPromise;
		} finally {
			if (this.refreshPromises.get(scope) === refreshPromise) {
				this.refreshPromises.delete(scope);
			}
		}
	}

	public async getSeriesLibraryStatusByTvdbId(input: {
		tvdbId: TvdbId;
		credentials: ProviderCredentials;
		forceVerify?: boolean;
		onCacheChanged?: () => Promise<void> | void;
	}): Promise<SonarrSeriesLibraryStatus> {
		const { credentials, tvdbId } = input;
		const snapshots = await this.getSeriesSnapshots(credentials);
		const cachedSeries =
			snapshots.find((series) => series.tvdbId === tvdbId) ?? null;
		const existsInCache = cachedSeries !== null;

		if (input.forceVerify !== true) {
			return {
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: existsInCache,
				...(cachedSeries ? { series: cachedSeries } : {}),
			};
		}

		try {
			const liveSeries = await this.client.findSeriesByTvdbId(
				tvdbId,
				credentials,
			);

			if (liveSeries) {
				const snapshot = toSonarrSeriesSnapshot(liveSeries);
				if (!existsInCache) {
					await this.upsertSeriesSnapshot(snapshot, credentials);
					await input.onCacheChanged?.();
				}

				return {
					provider: "sonarr",
					providerId: tvdbId,
					isInLibrary: true,
					series: liveSeries,
				};
			}
		} catch (error) {
			logError(normalizeError(error), `SonarrLibrary:check:${tvdbId}`);
			return {
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		let lookupSeries: SonarrLookupSeries | null = null;
		try {
			lookupSeries = await this.client.lookupSeriesByTvdbId(
				tvdbId,
				credentials,
			);
		} catch (error) {
			logError(normalizeError(error), `SonarrLibrary:lookup:${tvdbId}`);
		}

		if (existsInCache) {
			await this.removeSeriesSnapshot(tvdbId, credentials);
			await input.onCacheChanged?.();
		}

		return {
			provider: "sonarr",
			providerId: tvdbId,
			isInLibrary: false,
			...(lookupSeries ? { series: lookupSeries } : {}),
		};
	}

	public async upsertSeriesSnapshot(
		snapshot: SonarrSeriesSnapshot,
		credentials: ProviderCredentials,
	): Promise<void> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const memoryCache = this.memoryCache.get(scope);
		const cached =
			memoryCache && Date.now() < memoryCache.expiresAt
				? memoryCache
				: await this.cache.read(cacheKey);
		if (generation !== this.cacheGeneration) return;
		const current = cached?.value ?? [];
		const existingIndex = current.findIndex(
			(item) => item.tvdbId === snapshot.tvdbId,
		);
		const next =
			existingIndex === -1
				? [...current, snapshot]
				: [
						...current.slice(0, existingIndex),
						snapshot,
						...current.slice(existingIndex + 1),
					];

		await this.cache.write(cacheKey, next, CACHE_TTL.normal);
		if (generation === this.cacheGeneration) {
			this.setMemoryCache(scope, next, CACHE_TTL.normal);
		}
	}

	public async removeSeriesSnapshot(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<void> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const memoryCache = this.memoryCache.get(scope);
		const cached =
			memoryCache && Date.now() < memoryCache.expiresAt
				? memoryCache
				: await this.cache.read(cacheKey);
		if (generation !== this.cacheGeneration) return;
		if (!cached) return;

		const next = cached.value.filter((series) => series.tvdbId !== tvdbId);
		if (next.length === cached.value.length) return;

		await this.cache.write(cacheKey, next, CACHE_TTL.normal);
		if (generation === this.cacheGeneration) {
			this.setMemoryCache(scope, next, CACHE_TTL.normal);
		}
	}

	public async clearSeriesSnapshotCache(): Promise<void> {
		if (this.clearPromise) return this.clearPromise;

		this.cacheGeneration += 1;
		this.memoryCache.clear();
		this.refreshPromises.clear();

		const clearPromise = this.cache.clear().finally(() => {
			this.memoryCache.clear();
			if (this.clearPromise === clearPromise) {
				this.clearPromise = null;
			}
		});
		this.clearPromise = clearPromise;
		return clearPromise;
	}

	private setMemoryCache(
		scope: string,
		value: SonarrSeriesSnapshot[],
		options: CacheWriteOptions,
	): void {
		const now = Date.now();
		this.memoryCache.set(scope, {
			value,
			stale: false,
			staleAt: now + options.staleMs,
			expiresAt: now + (options.hardMs ?? options.staleMs * 4),
			...(options.meta ? { meta: options.meta } : {}),
		});
	}
}

export function toSonarrSeriesSnapshot(
	series: SonarrSeries,
): SonarrSeriesSnapshot {
	const alternateTitles = series.alternateTitles
		?.map((entry) => entry.title?.trim())
		.filter((title): title is string => !!title);

	const snapshot: SonarrSeriesSnapshot = {
		id: series.id,
		tvdbId: series.tvdbId,
		title: series.title,
		titleSlug: series.titleSlug,
	};

	if (alternateTitles !== undefined) snapshot.alternateTitles = alternateTitles;
	if (series.status !== undefined) snapshot.status = series.status;

	if (series.statistics) {
		snapshot.statistics = {};
		if (series.statistics.episodeCount !== undefined) {
			snapshot.statistics.episodeCount = series.statistics.episodeCount;
		}
		if (series.statistics.episodeFileCount !== undefined) {
			snapshot.statistics.episodeFileCount = series.statistics.episodeFileCount;
		}
		if (series.statistics.totalEpisodeCount !== undefined) {
			snapshot.statistics.totalEpisodeCount =
				series.statistics.totalEpisodeCount;
		}
	}

	return snapshot;
}
