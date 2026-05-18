/** Sonarr provider-domain library snapshot cache and TVDB lookup helpers. */
// src/providers/sonarr/library.ts

import type { LibraryUnknownReason } from "@/mapping/library-status";
import { createTtlCache, type TtlCache } from "@/shared/cache/ttl-cache";
import { logError, normalizeError } from "@/shared/errors";
import type { ProviderCredentials } from "../types";
import type { SonarrClient } from "./client";
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
	TvdbId,
} from "./types";

const SONARR_SERIES_CACHE_KEY = "series";
const SONARR_SERIES_CACHE_TTL = {
	normal: {
		staleMs: 60 * 60 * 1000,
		hardMs: 24 * 60 * 60 * 1000,
	},
	error: {
		staleMs: 5 * 60 * 1000,
		hardMs: 10 * 60 * 1000,
	},
};

const defaultSeriesSnapshotCache = createTtlCache<SonarrSeriesSnapshot[]>(
	"sonarr:series-snapshots",
);

type SonarrLibraryClient = Pick<
	SonarrClient,
	"getAllSeries" | "findSeriesByTvdbId" | "lookupSeriesByTvdbId"
>;

type SonarrLibraryDeps = {
	client: SonarrLibraryClient;
	cache?: TtlCache<SonarrSeriesSnapshot[]>;
};

export interface SonarrSeriesLibraryStatus {
	provider: "sonarr";
	providerId: TvdbId;
	isInLibrary: boolean | null;
	series?: SonarrSeriesSnapshot | SonarrSeries | SonarrLookupSeries;
	libraryUnknownReason?: LibraryUnknownReason;
}

export class SonarrLibrary {
	private readonly client: SonarrLibraryDeps["client"];
	private readonly cache: TtlCache<SonarrSeriesSnapshot[]>;
	private refreshPromise: Promise<SonarrSeriesSnapshot[]> | null = null;

	public constructor(deps: SonarrLibraryDeps) {
		this.client = deps.client;
		this.cache = deps.cache ?? defaultSeriesSnapshotCache;
	}

	public async getSeriesSnapshots(
		credentials: ProviderCredentials,
	): Promise<SonarrSeriesSnapshot[]> {
		const cached = await this.cache.read(SONARR_SERIES_CACHE_KEY);
		if (!cached) return this.refreshSeriesSnapshots(credentials);

		if (cached.stale) {
			// Stale cache is good enough for status; refresh quietly for the next read.
			void this.refreshSeriesSnapshots(credentials).catch(() => {});
		}

		return cached.value;
	}

	public async refreshSeriesSnapshots(
		credentials: ProviderCredentials,
	): Promise<SonarrSeriesSnapshot[]> {
		if (this.refreshPromise) return this.refreshPromise;

		this.refreshPromise = (async () => {
			const cached = await this.cache.read(SONARR_SERIES_CACHE_KEY);
			const fallback = cached?.value ?? [];

			try {
				const series = await this.client.getAllSeries(credentials);
				const snapshots = series.map((element) =>
					toSonarrSeriesSnapshot(element),
				);

				await this.cache.write(
					SONARR_SERIES_CACHE_KEY,
					snapshots,
					SONARR_SERIES_CACHE_TTL.normal,
				);

				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				await this.cache.write(SONARR_SERIES_CACHE_KEY, fallback, {
					...SONARR_SERIES_CACHE_TTL.error,
					meta: { lastErrorCode: normalized.code },
				});
				return fallback;
			} finally {
				this.refreshPromise = null;
			}
		})();

		return this.refreshPromise;
	}

	public async findSeriesByTvdbId(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries | null> {
		return this.client.findSeriesByTvdbId(tvdbId, credentials);
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
			const liveSeries = await this.findSeriesByTvdbId(tvdbId, credentials);

			if (liveSeries) {
				const snapshot = toSonarrSeriesSnapshot(liveSeries);
				if (!existsInCache) {
					await this.upsertSeriesSnapshot(snapshot);
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
			logError(
				normalizeError(error),
				`SonarrLibrary:getSeriesLibraryStatusByTvdbId:library:${tvdbId}`,
			);
			return {
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		let lookupSeries: SonarrLookupSeries | null = null;
		try {
			lookupSeries = await this.client.lookupSeriesByTvdbId(tvdbId, credentials);
		} catch (error) {
			logError(
				normalizeError(error),
				`SonarrLibrary:getSeriesLibraryStatusByTvdbId:lookup:${tvdbId}`,
			);
		}

		if (existsInCache) {
			await this.removeSeriesSnapshot(tvdbId);
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
	): Promise<void> {
		const cached = await this.cache.read(SONARR_SERIES_CACHE_KEY);
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

		await this.cache.write(
			SONARR_SERIES_CACHE_KEY,
			next,
			SONARR_SERIES_CACHE_TTL.normal,
		);
	}

	public async removeSeriesSnapshot(tvdbId: TvdbId): Promise<void> {
		const cached = await this.cache.read(SONARR_SERIES_CACHE_KEY);
		if (!cached) return;

		const next = cached.value.filter((series) => series.tvdbId !== tvdbId);
		if (next.length === cached.value.length) return;

		await this.cache.write(
			SONARR_SERIES_CACHE_KEY,
			next,
			SONARR_SERIES_CACHE_TTL.normal,
		);
	}

	public async clearSeriesSnapshotCache(): Promise<void> {
		await this.cache.remove(SONARR_SERIES_CACHE_KEY);
	}
}

export function toSonarrSeriesSnapshot(
	series: SonarrSeries,
): SonarrSeriesSnapshot {
	const alternateTitles = series.alternateTitles
		?.map((entry) => entry.title?.trim())
		.filter((title): title is string => !!title);
	const statistics = series.statistics
		? {
				...(series.statistics.episodeCount === undefined
					? {}
					: { episodeCount: series.statistics.episodeCount }),
				...(series.statistics.episodeFileCount === undefined
					? {}
					: { episodeFileCount: series.statistics.episodeFileCount }),
				...(series.statistics.totalEpisodeCount === undefined
					? {}
					: { totalEpisodeCount: series.statistics.totalEpisodeCount }),
			}
		: undefined;

	// Snapshots are intentionally small: enough for status checks, not edit saves.
	return {
		id: series.id,
		tvdbId: series.tvdbId,
		title: series.title,
		titleSlug: series.titleSlug,
		...(alternateTitles === undefined
			? {}
			: { alternateTitles }),
		...(series.status === undefined ? {} : { status: series.status }),
		...(statistics === undefined ? {} : { statistics }),
	};
}
