/** Radarr provider-domain library snapshot cache and TMDB lookup helpers. */
// src/providers/radarr/library.ts

import type { LibraryUnknownReason } from "@/mapping/library-status";
import { createTtlCache, type TtlCache } from "@/shared/cache/ttl-cache";
import { logError, normalizeError } from "@/shared/errors";
import type { ProviderCredentials } from "../types";
import type { RadarrClient } from "./client";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
	TmdbId,
} from "./types";

const RADARR_MOVIE_CACHE_KEY = "movies";
const RADARR_MOVIE_CACHE_TTL = {
	normal: {
		staleMs: 60 * 60 * 1000,
		hardMs: 24 * 60 * 60 * 1000,
	},
	error: {
		staleMs: 5 * 60 * 1000,
		hardMs: 10 * 60 * 1000,
	},
};

const defaultMovieSnapshotCache = createTtlCache<RadarrMovieSnapshot[]>(
	"radarr:movie-snapshots",
);

type RadarrLibraryClient = Pick<
	RadarrClient,
	"getAllMovies" | "findMovieByTmdbId" | "lookupMovieByTmdbId"
>;

type RadarrLibraryDeps = {
	client: RadarrLibraryClient;
	cache?: TtlCache<RadarrMovieSnapshot[]>;
};

export interface RadarrMovieLibraryStatus {
	provider: "radarr";
	providerId: TmdbId;
	isInLibrary: boolean | null;
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
	libraryUnknownReason?: LibraryUnknownReason;
}

export class RadarrLibrary {
	private readonly client: RadarrLibraryDeps["client"];
	private readonly cache: TtlCache<RadarrMovieSnapshot[]>;
	private refreshPromise: Promise<RadarrMovieSnapshot[]> | null = null;

	public constructor(deps: RadarrLibraryDeps) {
		this.client = deps.client;
		this.cache = deps.cache ?? defaultMovieSnapshotCache;
	}

	public async getMovieSnapshots(
		credentials: ProviderCredentials,
	): Promise<RadarrMovieSnapshot[]> {
		const cached = await this.cache.read(RADARR_MOVIE_CACHE_KEY);
		if (!cached) return this.refreshMovieSnapshots(credentials);

		if (cached.stale) {
			// Stale cache is good enough for status; refresh quietly for the next read.
			void this.refreshMovieSnapshots(credentials).catch(() => {});
		}

		return cached.value;
	}

	public async refreshMovieSnapshots(
		credentials: ProviderCredentials,
	): Promise<RadarrMovieSnapshot[]> {
		if (this.refreshPromise) return this.refreshPromise;

		this.refreshPromise = (async () => {
			const cached = await this.cache.read(RADARR_MOVIE_CACHE_KEY);
			const fallback = cached?.value ?? [];

			try {
				const movies = await this.client.getAllMovies(credentials);
				const snapshots = movies
					.filter(
						(movie) =>
							typeof movie.tmdbId === "number" && Number.isFinite(movie.tmdbId),
					)
					.map((movie) => toRadarrMovieSnapshot(movie));

				await this.cache.write(
					RADARR_MOVIE_CACHE_KEY,
					snapshots,
					RADARR_MOVIE_CACHE_TTL.normal,
				);

				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				logError(normalized, "RadarrLibrary:refreshMovieSnapshots");
				await this.cache.write(RADARR_MOVIE_CACHE_KEY, fallback, {
					...RADARR_MOVIE_CACHE_TTL.error,
					meta: { lastErrorCode: normalized.code },
				});
				return fallback;
			} finally {
				this.refreshPromise = null;
			}
		})();

		return this.refreshPromise;
	}

	public async findMovieSnapshotByTmdbId(
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovieSnapshot | null> {
		const snapshots = await this.getMovieSnapshots(credentials);
		return snapshots.find((movie) => movie.tmdbId === tmdbId) ?? null;
	}

	public async findMovieByTmdbId(
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie | null> {
		return this.client.findMovieByTmdbId(tmdbId, credentials);
	}

	public async getMovieLibraryStatusByTmdbId(input: {
		tmdbId: TmdbId;
		credentials: ProviderCredentials;
		forceVerify?: boolean;
		onCacheChanged?: () => Promise<void> | void;
	}): Promise<RadarrMovieLibraryStatus> {
		const { credentials, tmdbId } = input;
		const snapshots = await this.getMovieSnapshots(credentials);
		const cachedMovie =
			snapshots.find((movie) => movie.tmdbId === tmdbId) ?? null;
		const existsInCache = cachedMovie !== null;

		if (input.forceVerify !== true) {
			return {
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: existsInCache,
				...(cachedMovie ? { movie: cachedMovie } : {}),
			};
		}

		try {
			const liveMovie = await this.findMovieByTmdbId(tmdbId, credentials);

			if (liveMovie) {
				const snapshot = toRadarrMovieSnapshot(liveMovie);
				if (!existsInCache) {
					await this.upsertMovieSnapshot(snapshot);
					await input.onCacheChanged?.();
				}

				return {
					provider: "radarr",
					providerId: tmdbId,
					isInLibrary: true,
					movie: snapshot,
				};
			}
		} catch (error) {
			logError(
				normalizeError(error),
				`RadarrLibrary:getMovieLibraryStatusByTmdbId:library:${tmdbId}`,
			);
			return {
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		let lookupMovie: RadarrLookupMovie | null = null;
		try {
			lookupMovie = await this.client.lookupMovieByTmdbId(tmdbId, credentials);
		} catch (error) {
			logError(
				normalizeError(error),
				`RadarrLibrary:getMovieLibraryStatusByTmdbId:lookup:${tmdbId}`,
			);
		}

		if (existsInCache) {
			await this.removeMovieSnapshot(tmdbId);
			await input.onCacheChanged?.();
		}

		return {
			provider: "radarr",
			providerId: tmdbId,
			isInLibrary: false,
			...(lookupMovie ? { movie: lookupMovie } : {}),
		};
	}

	public async upsertMovieSnapshot(
		snapshot: RadarrMovieSnapshot,
	): Promise<void> {
		const cached = await this.cache.read(RADARR_MOVIE_CACHE_KEY);
		const current = cached?.value ?? [];
		const existingIndex = current.findIndex(
			(item) => item.tmdbId === snapshot.tmdbId,
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
			RADARR_MOVIE_CACHE_KEY,
			next,
			RADARR_MOVIE_CACHE_TTL.normal,
		);
	}

	public async removeMovieSnapshot(tmdbId: TmdbId): Promise<void> {
		const cached = await this.cache.read(RADARR_MOVIE_CACHE_KEY);
		if (!cached) return;

		const next = cached.value.filter((movie) => movie.tmdbId !== tmdbId);
		if (next.length === cached.value.length) return;

		await this.cache.write(
			RADARR_MOVIE_CACHE_KEY,
			next,
			RADARR_MOVIE_CACHE_TTL.normal,
		);
	}

	public async clearMovieSnapshotCache(): Promise<void> {
		await this.cache.remove(RADARR_MOVIE_CACHE_KEY);
	}
}

export function toRadarrMovieSnapshot(movie: RadarrMovie): RadarrMovieSnapshot {
	const alternateTitles = Array.isArray(movie.alternateTitles)
		? movie.alternateTitles
				.map((entry) => entry?.title?.trim())
				.filter((value): value is string => !!value)
		: undefined;

	// Snapshots are intentionally small: enough for status checks, not edit saves.
	return {
		id: movie.id,
		tmdbId: movie.tmdbId,
		title: movie.title,
		...(movie.titleSlug === undefined ? {} : { titleSlug: movie.titleSlug }),
		...(movie.sortTitle === undefined ? {} : { sortTitle: movie.sortTitle }),
		...(movie.originalTitle === undefined
			? {}
			: { originalTitle: movie.originalTitle }),
		...(movie.folderName === undefined ? {} : { folderName: movie.folderName }),
		...(movie.imdbId === undefined ? {} : { imdbId: movie.imdbId }),
		...(movie.year === undefined ? {} : { year: movie.year }),
		...(alternateTitles === undefined ? {} : { alternateTitles }),
		...(movie.monitored === undefined ? {} : { monitored: movie.monitored }),
		...(movie.minimumAvailability === undefined
			? {}
			: { minimumAvailability: movie.minimumAvailability }),
		...(movie.hasFile === undefined ? {} : { hasFile: movie.hasFile }),
		...(movie.sizeOnDisk === undefined ? {} : { sizeOnDisk: movie.sizeOnDisk }),
		...(movie.status === undefined ? {} : { status: movie.status }),
	};
}
