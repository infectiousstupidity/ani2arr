/** Radarr provider-domain library snapshot cache and TMDB lookup helpers. */
// src/providers/radarr/library.ts

import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { KeyedTaskQueue } from "@/shared/cache/keyed-task-queue";
import {
	createTtlCache,
	type CacheHit,
	type CacheWriteOptions,
	type TtlCache,
} from "@/shared/cache/ttl-cache";
import { logError, normalizeError } from "@/shared/errors/error-utils";
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
	private readonly cacheQueue = new KeyedTaskQueue();
	private readonly refreshes = new Map<
		string,
		{
			promise: Promise<RadarrMovieSnapshot[]>;
			latestMutation: RadarrMovieSnapshot[] | undefined;
		}
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
			return this.getMovieSnapshots(credentials);
		}
		if (!cached) return this.refreshMovieSnapshots(credentials);

		if (Date.now() >= cached.staleAt) {
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
		const existingRefresh = this.refreshes.get(scope);
		if (existingRefresh) return existingRefresh.promise;

		const cacheKey = `${CACHE_KEY}:${scope}`;
		const generation = this.cacheGeneration;
		let changed = false;
		const refresh = {
			latestMutation: undefined as RadarrMovieSnapshot[] | undefined,
			promise: (async (): Promise<RadarrMovieSnapshot[]> => {
				const cached = await this.cache.read(cacheKey);
				const result = await this.client
					.getAllMovies(credentials)
					.then((movies) => ({
						snapshots: movies
							.filter(
								(movie) =>
									typeof movie.tmdbId === "number" &&
									Number.isFinite(movie.tmdbId),
							)
							.map((movie) => toRadarrMovieSnapshot(movie)),
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
						logError(normalized, "RadarrLibrary:refreshMovieSnapshots");
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

		let snapshots: RadarrMovieSnapshot[];
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
				logError(normalizeError(error), "RadarrLibrary:snapshotChanged");
			}
		}
		return snapshots;
	}

	public async getMovieLibraryStatusByTmdbId(input: {
		tmdbId: TmdbId;
		credentials: ProviderCredentials;
		forceVerify?: boolean;
		onCacheChanged?: () => Promise<void> | void;
	}): Promise<RadarrMovieLibraryStatus> {
		const { credentials, tmdbId } = input;
		let snapshots: RadarrMovieSnapshot[] = [];
		try {
			snapshots = await this.getMovieSnapshots(credentials);
		} catch {
			if (input.forceVerify !== true) {
				return {
					provider: "radarr",
					providerId: tmdbId,
					isInLibrary: null,
					libraryUnknownReason: "library-check-failed",
				};
			}
		}
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

		let liveMovie: RadarrMovie | null;
		try {
			liveMovie = await this.client.findMovieByTmdbId(tmdbId, credentials);
		} catch (error) {
			logError(normalizeError(error), `RadarrLibrary:check:${tmdbId}`);
			return {
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		if (liveMovie) {
			const snapshot = toRadarrMovieSnapshot(liveMovie);
			if (!existsInCache) {
				try {
					const changed = await this.upsertMovieSnapshot(snapshot, credentials);
					if (changed) await input.onCacheChanged?.();
				} catch (error) {
					logError(normalizeError(error), `RadarrLibrary:cache:${tmdbId}`);
				}
			}

			return {
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: true,
				movie: liveMovie,
			};
		}

		let lookupMovie: RadarrLookupMovie | null = null;
		try {
			lookupMovie = await this.client.lookupMovieByTmdbId(tmdbId, credentials);
		} catch (error) {
			logError(normalizeError(error), `RadarrLibrary:lookup:${tmdbId}`);
		}

		if (existsInCache) {
			try {
				const changed = await this.removeMovieSnapshot(tmdbId, credentials);
				if (changed) await input.onCacheChanged?.();
			} catch (error) {
				logError(normalizeError(error), `RadarrLibrary:cache:${tmdbId}`);
			}
		}

		return {
			provider: "radarr",
			providerId: tmdbId,
			isInLibrary: false,
			...(lookupMovie ? { movie: lookupMovie } : {}),
		};
	}

	public upsertMovieSnapshot(
		snapshot: RadarrMovieSnapshot,
		credentials: ProviderCredentials,
	): Promise<boolean> {
		return this.mutateSnapshots(credentials, (current) => {
			const index = current.findIndex(
				(item) => item.tmdbId === snapshot.tmdbId,
			);
			if (index === -1) return [...current, snapshot];
			if (JSON.stringify(current[index]) === JSON.stringify(snapshot)) {
				return null;
			}
			return current.with(index, snapshot);
		});
	}

	public removeMovieSnapshot(
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<boolean> {
		return this.mutateSnapshots(credentials, (current) => {
			const next = current.filter((movie) => movie.tmdbId !== tmdbId);
			return next.length === current.length ? null : next;
		});
	}

	public async clearMovieSnapshotCache(): Promise<void> {
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
		update: (
			current: readonly RadarrMovieSnapshot[],
		) => RadarrMovieSnapshot[] | null,
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
	): CacheHit<RadarrMovieSnapshot[]> | undefined {
		const memory = this.memoryCache.get(scope);
		return memory && Date.now() < memory.expiresAt ? memory : undefined;
	}

	private async writeSnapshots(
		scope: string,
		value: RadarrMovieSnapshot[],
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
