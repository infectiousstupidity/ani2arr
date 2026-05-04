import { createTtlCache, type TtlCache } from "@/shared/cache/ttl-cache";
import type { ProviderCredentials } from "../types";
import type { SonarrClient } from "./client";
import type { SonarrSeries, SonarrSeriesSnapshot, TvdbId } from "./types";

const SONARR_SERIES_CACHE_KEY = "series";
const SONARR_SERIES_CACHE_TTL = {
	staleMs: 60 * 60 * 1000,
	hardMs: 24 * 60 * 60 * 1000,
};

const defaultSeriesSnapshotCache = createTtlCache<SonarrSeriesSnapshot[]>(
	"sonarr:series-snapshots",
);

type SonarrLibraryDeps = {
	client: Pick<SonarrClient, "getSeries" | "getSeriesByTvdbId">;
	cache?: TtlCache<SonarrSeriesSnapshot[]>;
};

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
			try {
				const series = await this.client.getSeries(credentials);
				const snapshots = series.map((element) =>
					toSonarrSeriesSnapshot(element),
				);

				await this.cache.write(
					SONARR_SERIES_CACHE_KEY,
					snapshots,
					SONARR_SERIES_CACHE_TTL,
				);

				return snapshots;
			} finally {
				this.refreshPromise = null;
			}
		})();

		return this.refreshPromise;
	}

	public async findSeriesSnapshotByTvdbId(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeriesSnapshot | null> {
		const snapshots = await this.getSeriesSnapshots(credentials);
		return snapshots.find((series) => series.tvdbId === tvdbId) ?? null;
	}

	public async findSeriesByTvdbId(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries | null> {
		return this.client.getSeriesByTvdbId(tvdbId, credentials);
	}

	public async upsertSeriesSnapshot(series: SonarrSeries): Promise<void> {
		const snapshot = toSonarrSeriesSnapshot(series);
		const cached = await this.cache.read(SONARR_SERIES_CACHE_KEY);
		const current = cached?.value ?? [];
		const existingIndex = current.findIndex(
			(item) => item.tvdbId === series.tvdbId,
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
			SONARR_SERIES_CACHE_TTL,
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
			SONARR_SERIES_CACHE_TTL,
		);
	}

	public async clearSeriesSnapshotCache(): Promise<void> {
		await this.cache.remove(SONARR_SERIES_CACHE_KEY);
	}
}

export function toSonarrSeriesSnapshot(
	series: SonarrSeries,
): SonarrSeriesSnapshot {
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
		...(series.alternateTitles === undefined
			? {}
			: { alternateTitles: series.alternateTitles }),
		...(series.status === undefined ? {} : { status: series.status }),
		...(statistics === undefined ? {} : { statistics }),
	};
}
