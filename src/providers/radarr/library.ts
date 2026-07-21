/** Radarr provider-domain library snapshot cache and TMDB lookup helpers. */
// src/providers/radarr/library.ts

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
import type { TmdbId } from "../schemas";
import type { ProviderCredentials } from "../types";
import type { RadarrClient } from "./client";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
} from "./types";

const CACHE_KEY = "movies";
const CACHE_TTL = {
	normal: { staleMs: 60 * 60 * 1000, hardMs: 24 * 60 * 60 * 1000 },
	error: { staleMs: 5 * 60 * 1000, hardMs: 10 * 60 * 1000 },
};

const defaultCache = createTtlCache<RadarrMovieSnapshot[]>(
	"radarr:movie-snapshots",
);

export type LibraryUnknownReason = "library-check-failed";

export interface RadarrMovieLibraryStatus {
	provider: "radarr";
	providerId: TmdbId;
	isInLibrary: boolean | null;
	movie?: RadarrMovieSnapshot | RadarrMovie | RadarrLookupMovie;
	libraryUnknownReason?: LibraryUnknownReason;
}

export class RadarrLibrary {
	private readonly memoryCache = new Map<
		string,
		CacheHit<RadarrMovieSnapshot[]>
	>();
	private readonly refreshPromises = new Map<
		string,
		Promise<RadarrMovieSnapshot[]>
	>();
	private cacheGeneration = 0;
	private clearPromise: Promise<void> | null = null;

	public constructor(
		private readonly client: RadarrClient,
		private readonly cache: TtlCache<RadarrMovieSnapshot[]> = defaultCache,
		private readonly onSnapshotsChanged?: () => Promise<void> | void,
	) {}

	public async getMovieSnapshots(
		credentials: ProviderCredentials,
	): Promise<RadarrMovieSnapshot[]> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const memoryCache = this.memoryCache.get(scope);
		const now = Date.now();

		if (memoryCache && now < memoryCache.expiresAt) {
			if (now >= memoryCache.staleAt) {
				// Stale cache is good enough for status; refresh quietly for the next read.
				void this.refreshMovieSnapshots(credentials).catch(() => {});
			}

			return memoryCache.value;
		}

		this.memoryCache.delete(scope);
		const cached = await this.cache.read(cacheKey);
		if (generation !== this.cacheGeneration) {
			return this.getMovieSnapshots(credentials);
		}
		if (!cached) return this.refreshMovieSnapshots(credentials);

		this.memoryCache.set(scope, cached);
		if (cached.stale) {
			// Stale cache is good enough for status; refresh quietly for the next read.
			void this.refreshMovieSnapshots(credentials).catch(() => {});
		}

		return cached.value;
	}

	public async refreshMovieSnapshots(
		credentials: ProviderCredentials,
	): Promise<RadarrMovieSnapshot[]> {
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
				const movies = await this.client.getAllMovies(credentials);
				const snapshots = movies
					.filter(
						(movie) =>
							typeof movie.tmdbId === "number" && Number.isFinite(movie.tmdbId),
					)
					.map((movie) => toRadarrMovieSnapshot(movie));

				if (generation !== this.cacheGeneration) return snapshots;
				await this.cache.write(cacheKey, snapshots, CACHE_TTL.normal);
				if (generation !== this.cacheGeneration) return snapshots;

				this.setMemoryCache(scope, snapshots, CACHE_TTL.normal);
				if (JSON.stringify(fallback) !== JSON.stringify(snapshots)) {
					try {
						await this.onSnapshotsChanged?.();
					} catch (error) {
						logError(
							normalizeError(error),
							"RadarrLibrary:snapshotChanged",
						);
					}
				}

				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				logError(normalized, "RadarrLibrary:refreshMovieSnapshots");
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
			const liveMovie = await this.client.findMovieByTmdbId(
				tmdbId,
				credentials,
			);

			if (liveMovie) {
				const snapshot = toRadarrMovieSnapshot(liveMovie);
				if (!existsInCache) {
					const changed = await this.upsertMovieSnapshot(snapshot, credentials);
					if (changed) await input.onCacheChanged?.();
				}

				return {
					provider: "radarr",
					providerId: tmdbId,
					isInLibrary: true,
					movie: liveMovie,
				};
			}
		} catch (error) {
			logError(normalizeError(error), `RadarrLibrary:check:${tmdbId}`);
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
			logError(normalizeError(error), `RadarrLibrary:lookup:${tmdbId}`);
		}

		if (existsInCache) {
			const changed = await this.removeMovieSnapshot(tmdbId, credentials);
			if (changed) await input.onCacheChanged?.();
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
		credentials: ProviderCredentials,
	): Promise<boolean> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const memoryCache = this.memoryCache.get(scope);
		const cached =
			memoryCache && Date.now() < memoryCache.expiresAt
				? memoryCache
				: await this.cache.read(cacheKey);
		if (generation !== this.cacheGeneration) return false;
		const current = cached?.value ?? [];
		const existingIndex = current.findIndex(
			(item) => item.tmdbId === snapshot.tmdbId,
		);
		const existingSnapshot = current[existingIndex];
		if (
			existingSnapshot !== undefined &&
			JSON.stringify(existingSnapshot) === JSON.stringify(snapshot)
		) {
			return false;
		}
		const next =
			existingIndex === -1
				? [...current, snapshot]
				: [
						...current.slice(0, existingIndex),
						snapshot,
						...current.slice(existingIndex + 1),
					];

		await this.cache.write(cacheKey, next, CACHE_TTL.normal);
		if (generation !== this.cacheGeneration) return false;
		this.setMemoryCache(scope, next, CACHE_TTL.normal);
		return true;
	}

	public async removeMovieSnapshot(
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<boolean> {
		if (this.clearPromise) await this.clearPromise;

		const scope = getProviderConnectionScope(credentials);
		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		const memoryCache = this.memoryCache.get(scope);
		const cached =
			memoryCache && Date.now() < memoryCache.expiresAt
				? memoryCache
				: await this.cache.read(cacheKey);
		if (generation !== this.cacheGeneration) return false;
		if (!cached) return false;

		const next = cached.value.filter((movie) => movie.tmdbId !== tmdbId);
		if (next.length === cached.value.length) return false;

		await this.cache.write(cacheKey, next, CACHE_TTL.normal);
		if (generation !== this.cacheGeneration) return false;
		this.setMemoryCache(scope, next, CACHE_TTL.normal);
		return true;
	}

	public async clearMovieSnapshotCache(): Promise<void> {
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
		value: RadarrMovieSnapshot[],
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

export function toRadarrMovieSnapshot(movie: RadarrMovie): RadarrMovieSnapshot {
	const alternateTitles = Array.isArray(movie.alternateTitles)
		? movie.alternateTitles
				.map((entry) => entry?.title?.trim())
				.filter((value): value is string => !!value)
		: undefined;

	const snapshot: RadarrMovieSnapshot = {
		id: movie.id,
		tmdbId: movie.tmdbId,
		title: movie.title,
	};

	if (movie.titleSlug !== undefined) snapshot.titleSlug = movie.titleSlug;
	if (movie.sortTitle !== undefined) snapshot.sortTitle = movie.sortTitle;
	if (movie.originalTitle !== undefined)
		snapshot.originalTitle = movie.originalTitle;
	if (movie.folderName !== undefined) snapshot.folderName = movie.folderName;
	if (movie.imdbId !== undefined) snapshot.imdbId = movie.imdbId;
	if (movie.year !== undefined) snapshot.year = movie.year;
	if (alternateTitles !== undefined) snapshot.alternateTitles = alternateTitles;
	if (movie.monitored !== undefined) snapshot.monitored = movie.monitored;
	if (movie.minimumAvailability !== undefined)
		snapshot.minimumAvailability = movie.minimumAvailability;
	if (movie.hasFile !== undefined) snapshot.hasFile = movie.hasFile;
	if (movie.sizeOnDisk !== undefined) snapshot.sizeOnDisk = movie.sizeOnDisk;
	if (movie.status !== undefined) snapshot.status = movie.status;

	return snapshot;
}
