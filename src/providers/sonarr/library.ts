/** Sonarr provider-domain library snapshot cache and TVDB lookup helpers. */
// src/providers/sonarr/library.ts

import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { KeyedTaskQueue } from "@/shared/cache/keyed-task-queue";
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
import type { TvdbId } from "../schemas";
import type { ProviderCredentials } from "../types";
import type { SonarrClient } from "./client";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
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
	private readonly cacheQueue = new KeyedTaskQueue();
	private readonly refreshes = new Map<
		string,
		{
			promise: Promise<SonarrSeriesSnapshot[]>;
			latestMutation: SonarrSeriesSnapshot[] | undefined;
		}
	>();
	private cacheGeneration = 0;
	private clearPromise: Promise<void> | null = null;

	public constructor(
		private readonly client: SonarrClient,
		private readonly cache: TtlCache<SonarrSeriesSnapshot[]> = defaultCache,
		private readonly onSnapshotsChanged?: () => Promise<void> | void,
	) {}

	public async getSeriesSnapshots(
		credentials: ProviderCredentials,
	): Promise<SonarrSeriesSnapshot[]> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const generation = this.cacheGeneration;
		const memory = this.getUnexpiredMemory(scope);
		const cached =
			memory ??
			(await this.cacheQueue.run(scope, async () => {
				if (generation !== this.cacheGeneration) return null;
				const current = this.getUnexpiredMemory(scope);
				if (current) return current;

				this.memoryCache.delete(scope);
				const stored = await this.cache.read(`${CACHE_KEY}:${scope}`);
				if (stored && generation === this.cacheGeneration) {
					this.memoryCache.set(scope, stored);
				}
				return stored;
			}));
		if (generation !== this.cacheGeneration) {
			return this.getSeriesSnapshots(credentials);
		}
		if (!cached) return this.refreshSeriesSnapshots(credentials);

		if (Date.now() >= cached.staleAt) {
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
		const existingRefresh = this.refreshes.get(scope);
		if (existingRefresh) return existingRefresh.promise;

		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		let changed = false;
		const refresh = {
			latestMutation: undefined as SonarrSeriesSnapshot[] | undefined,
			promise: (async (): Promise<SonarrSeriesSnapshot[]> => {
				const cached = await this.cache.read(cacheKey);
				const result = await this.client
					.getAllSeries(credentials)
					.then((series) => ({
						snapshots: series.map((item) => toSonarrSeriesSnapshot(item)),
					}))
					.catch((error: unknown) => ({ error }));

				return this.cacheQueue.run(scope, async () => {
					// A mutation committed while the network request was pending.
					if (generation === this.cacheGeneration && refresh.latestMutation) {
						return refresh.latestMutation;
					}

					try {
						if ("error" in result) throw result.error;
						const { snapshots } = result;
						const written = await this.writeSnapshots(
							scope,
							snapshots,
							CACHE_TTL.normal,
							generation,
						);
						changed =
							written &&
							JSON.stringify(cached?.value ?? []) !== JSON.stringify(snapshots);
						return snapshots;
					} catch (error) {
						const normalized = normalizeError(error);
						logError(normalized, "SonarrLibrary:refreshSeriesSnapshots");
						if (!cached) throw normalized;
						const ttl = {
							...CACHE_TTL.error,
							meta: { lastErrorCode: normalized.code },
						};
						await this.writeSnapshots(scope, cached.value, ttl, generation);
						return cached.value;
					}
				});
			})(),
		};
		this.refreshes.set(scope, refresh);

		let snapshots: SonarrSeriesSnapshot[];
		try {
			snapshots = await refresh.promise;
		} finally {
			if (this.refreshes.get(scope) === refresh) this.refreshes.delete(scope);
		}

		// Notify after releasing the queue and coalesced refresh, so callbacks can re-enter.
		if (changed && generation === this.cacheGeneration) {
			try {
				await this.onSnapshotsChanged?.();
			} catch (error) {
				logError(normalizeError(error), "SonarrLibrary:snapshotChanged");
			}
		}
		return snapshots;
	}

	public async getSeriesLibraryStatusByTvdbId(input: {
		tvdbId: TvdbId;
		credentials: ProviderCredentials;
		forceVerify?: boolean;
		onCacheChanged?: () => Promise<void> | void;
	}): Promise<SonarrSeriesLibraryStatus> {
		const { credentials, tvdbId } = input;
		let snapshots: SonarrSeriesSnapshot[] = [];
		try {
			snapshots = await this.getSeriesSnapshots(credentials);
		} catch {
			if (input.forceVerify !== true) {
				return {
					provider: "sonarr",
					providerId: tvdbId,
					isInLibrary: null,
					libraryUnknownReason: "library-check-failed",
				};
			}
		}
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

		let liveSeries: SonarrSeries | null;
		try {
			liveSeries = await this.client.findSeriesByTvdbId(
				tvdbId,
				credentials,
			);
		} catch (error) {
			logError(normalizeError(error), `SonarrLibrary:check:${tvdbId}`);
			return {
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		if (liveSeries) {
			const snapshot = toSonarrSeriesSnapshot(liveSeries);
			if (!existsInCache) {
				try {
					const changed = await this.upsertSeriesSnapshot(
						snapshot,
						credentials,
					);
					if (changed) await input.onCacheChanged?.();
				} catch (error) {
					logError(normalizeError(error), `SonarrLibrary:cache:${tvdbId}`);
				}
			}

			return {
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: true,
				series: liveSeries,
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
			const changed = await this.removeSeriesSnapshot(tvdbId, credentials);
			if (changed) await input.onCacheChanged?.();
		}

		return {
			provider: "sonarr",
			providerId: tvdbId,
			isInLibrary: false,
			...(lookupSeries ? { series: lookupSeries } : {}),
		};
	}

	public upsertSeriesSnapshot(
		snapshot: SonarrSeriesSnapshot,
		credentials: ProviderCredentials,
	): Promise<boolean> {
		return this.mutateSnapshots(credentials, (current) => {
			const index = current.findIndex((item) => item.tvdbId === snapshot.tvdbId);
			if (index === -1) return [...current, snapshot];
			if (JSON.stringify(current[index]) === JSON.stringify(snapshot)) {
				return null;
			}
			return current.with(index, snapshot);
		});
	}

	public removeSeriesSnapshot(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<boolean> {
		return this.mutateSnapshots(credentials, (current) => {
			const next = current.filter((series) => series.tvdbId !== tvdbId);
			return next.length === current.length ? null : next;
		});
	}

	public async clearSeriesSnapshotCache(): Promise<void> {
		if (this.clearPromise) return this.clearPromise;

		this.cacheGeneration += 1;
		this.memoryCache.clear();
		this.refreshes.clear();

		// Finish outstanding storage operations before removing persisted snapshots.
		const clearPromise = this.cacheQueue
			.drain()
			.then(() => this.cache.clear())
			.finally(() => {
				this.clearPromise = null;
			});
		this.clearPromise = clearPromise;
		return clearPromise;
	}

	private async mutateSnapshots(
		credentials: ProviderCredentials,
		update: (current: readonly SonarrSeriesSnapshot[]) => SonarrSeriesSnapshot[] | null,
	): Promise<boolean> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		return this.cacheQueue.run(scope, async () => {
			if (generation !== this.cacheGeneration) return false;
			const cached =
				this.getUnexpiredMemory(scope) ?? (await this.cache.read(cacheKey));
			if (!cached || generation !== this.cacheGeneration) return false;
			const next = update(cached.value);
			if (!next) return false;

			const written = await this.writeSnapshots(
				scope,
				next,
				CACHE_TTL.normal,
				generation,
			);
			if (!written || generation !== this.cacheGeneration) return false;
			const refresh = this.refreshes.get(scope);
			if (refresh) refresh.latestMutation = next;
			return true;
		});
	}

	private getUnexpiredMemory(
		scope: string,
	): CacheHit<SonarrSeriesSnapshot[]> | undefined {
		const memory = this.memoryCache.get(scope);
		return memory && Date.now() < memory.expiresAt ? memory : undefined;
	}

	private async writeSnapshots(
		scope: string,
		value: SonarrSeriesSnapshot[],
		options: CacheWriteOptions,
		generation: number,
	): Promise<boolean> {
		if (generation !== this.cacheGeneration) return false;
		await this.cache.write(`${CACHE_KEY}:${scope}`, value, options);
		if (generation !== this.cacheGeneration) return false;

		const now = Date.now();
		this.memoryCache.set(scope, {
			value,
			stale: false,
			staleAt: now + options.staleMs,
			expiresAt: now + (options.hardMs ?? options.staleMs * 4),
			...(options.meta ? { meta: options.meta } : {}),
		});
		return true;
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
