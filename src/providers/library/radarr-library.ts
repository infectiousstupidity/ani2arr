/** Radarr-backed library cache and status lookup logic for movie records. */
// src/providers/library/radarr-library.ts

import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { AniListId } from "@/anilist";
import type { StatusInput } from "@/rpc/schemas";
import type { CheckMovieStatusResponse } from "@/rpc/types";
import type { MappingService } from "@/mapping/mapping.service";
import type { ManualMappingService } from "@/mapping/manual-mapping";
import type { AutoMappingOptions } from "@/mapping/auto-mapping/types";
import { ErrorCode, logError, normalizeError } from "@/shared/errors";
import {
	getExtensionOptionsSnapshot,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	type ExtensionOptions,
} from "@/options";
import type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
	TmdbId,
} from "@/providers";
import { notifyLibraryMutation } from "./notify-library-mutation";
import type {
	LibraryMutationEmitter,
	LibraryStatusOptions,
	ProviderLibraryCaches,
	RadarrLibraryStatus,
} from "./types";
import type { AnibridgeMappingStore } from "@/mapping/upstream-mapping";
import { PROVIDER_LIBRARY_CACHE_TTL } from "./cache";

const CACHE_KEY = "radarr:lean-movies";

type RadarrLibraryMutationPayload = {
	tmdbId: TmdbId;
	action: "added" | "removed";
};

function buildMovieStatusResponseFromLibraryStatus(input: {
	providerId: TmdbId;
	mappingSource?: CheckMovieStatusResponse["mappingSource"];
	mappingReason?: CheckMovieStatusResponse["mappingReason"];
	libraryStatus: RadarrLibraryStatus;
}): CheckMovieStatusResponse {
	return {
		providerId: input.providerId,
		providerMappingState: "mapped",
		isInLibrary: input.libraryStatus.isInLibrary,
		...(input.libraryStatus.movie ? { movie: input.libraryStatus.movie } : {}),
		...(input.libraryStatus.libraryUnknownReason
			? { libraryUnknownReason: input.libraryStatus.libraryUnknownReason }
			: {}),
		...(input.mappingSource ? { mappingSource: input.mappingSource } : {}),
		...(input.mappingReason ? { mappingReason: input.mappingReason } : {}),
	};
}

type RadarrStatusPayload = Pick<
	StatusInput,
	"anilistId" | "title" | "metadata"
>;

type RadarrMappingResult =
	| {
			kind: "mapped";
			tmdbId: TmdbId;
			successfulSynonym?: string;
			mappingReason?: CheckMovieStatusResponse["mappingReason"];
			mappingSource?: CheckMovieStatusResponse["mappingSource"];
	  }
	| { kind: "unmapped" }
	| { kind: "failed"; response: CheckMovieStatusResponse };

type RadarrLibraryDeps = {
	radarrClient: RadarrClient;
	mappingService: Pick<
		MappingService,
		"resolveProviderId" | "prioritizeAniListMedia" | "getAutoMapping"
	>;
	manualMappingService: Pick<ManualMappingService, "getLinkedAniListIds">;
	anibridgeMappingStore: Pick<AnibridgeMappingStore, "getAniListIdsForTmdb">;
	caches: ProviderLibraryCaches<RadarrMovieSnapshot>;
	emitLibraryMutation?: LibraryMutationEmitter<RadarrLibraryMutationPayload>;
};

export class RadarrLibrary {
	private inflightRefresh: Promise<RadarrMovieSnapshot[]> | null = null;
	private readonly radarrClient: RadarrClient;
	private readonly mappingService: Pick<
		MappingService,
		"resolveProviderId" | "prioritizeAniListMedia" | "getAutoMapping"
	>;
	private readonly manualMappingService: Pick<
		ManualMappingService,
		"getLinkedAniListIds"
	>;
	private readonly anibridgeMappingStore: Pick<
		AnibridgeMappingStore,
		"getAniListIdsForTmdb"
	>;
	private readonly caches: ProviderLibraryCaches<RadarrMovieSnapshot>;
	private readonly emitLibraryMutation:
		| LibraryMutationEmitter<RadarrLibraryMutationPayload>
		| undefined;

	constructor(deps: RadarrLibraryDeps) {
		this.radarrClient = deps.radarrClient;
		this.mappingService = deps.mappingService;
		this.manualMappingService = deps.manualMappingService;
		this.anibridgeMappingStore = deps.anibridgeMappingStore;
		this.caches = deps.caches;
		this.emitLibraryMutation = deps.emitLibraryMutation;
	}

	async getLeanMovieList(): Promise<RadarrMovieSnapshot[]> {
		const cached = await this.caches.lean.read(CACHE_KEY);
		if (cached) {
			if (cached.stale && !this.inflightRefresh) {
				this.refreshCache().catch((error) => {
					logError(normalizeError(error), `RadarrLibrary:backgroundRefresh`);
				});
			}
			return cached.value;
		}
		return this.refreshCache();
	}

	async refreshCache(
		optionsOverride?: ExtensionOptions,
	): Promise<RadarrMovieSnapshot[]> {
		if (this.inflightRefresh) return this.inflightRefresh;

		this.inflightRefresh = (async () => {
			const cached = await this.caches.lean.read(CACHE_KEY);
			const fallbackList = cached?.value ?? [];

			try {
				const options =
					optionsOverride ?? (await getExtensionOptionsSnapshot());
				const credentials = getProviderCredentials(options, "radarr");

				if (!credentials) {
					await this.caches.lean.remove(CACHE_KEY);
					return [];
				}

				const fullEntries = await this.radarrClient.getAllMovies(credentials);
				const snapshots = fullEntries
					.filter(
						(movie) =>
							typeof movie.tmdbId === "number" && Number.isFinite(movie.tmdbId),
					)
					.map((movie) => this.toMovieSnapshot(movie));

				await this.caches.lean.write(
					CACHE_KEY,
					snapshots,
					PROVIDER_LIBRARY_CACHE_TTL.normal,
				);
				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				logError(normalized, `RadarrLibrary:refreshCache`);
				await this.caches.lean.write(CACHE_KEY, fallbackList, {
					...PROVIDER_LIBRARY_CACHE_TTL.error,
					meta: { lastErrorCode: normalized.code },
				});
				return fallbackList;
			} finally {
				this.inflightRefresh = null;
			}
		})();

		return this.inflightRefresh;
	}

	async addMovieToCache(newMovie: RadarrMovie): Promise<void> {
		const current = await this.getLeanMovieList();
		const snapshot = this.toMovieSnapshot(newMovie);
		const idx = current.findIndex((item) => item.tmdbId === snapshot.tmdbId);
		const updated =
			idx === -1
				? [...current, snapshot]
				: [...current.slice(0, idx), snapshot, ...current.slice(idx + 1)];

		await this.caches.lean.write(
			CACHE_KEY,
			updated,
			PROVIDER_LIBRARY_CACHE_TTL.normal,
		);
	}

	async removeMovieFromCache(tmdbId: TmdbId): Promise<void> {
		const current = await this.getLeanMovieList();
		const filtered = current.filter((item) => item.tmdbId !== tmdbId);
		if (filtered.length === current.length) return;

		await this.caches.lean.write(
			CACHE_KEY,
			filtered,
			PROVIDER_LIBRARY_CACHE_TTL.normal,
		);
	}

	async getMovieLibraryStatus(input: {
		anilistId: AniListId;
		providerId: TmdbId;
		forceVerify?: boolean;
	}): Promise<RadarrLibraryStatus> {
		const leanList = await this.getLeanMovieList();
		const radarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			radarrOptions,
			"radarr",
		);
		const tmdbId = input.providerId;
		const cachedMovie =
			leanList.find((movie) => movie.tmdbId === tmdbId) ?? null;
		const existsInCache = cachedMovie !== null;

		if (!isConfigured || input.forceVerify !== true) {
			return {
				anilistId: input.anilistId,
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: existsInCache,
				...(cachedMovie ? { movie: cachedMovie } : {}),
			};
		}

		const credentials = getProviderCredentials(radarrOptions, "radarr")!;
		let liveMovie: RadarrMovie | null = null;
		try {
			liveMovie = await this.radarrClient.getMovieByTmdbId(tmdbId, credentials);
		} catch (error) {
			logError(
				normalizeError(error),
				`RadarrLibrary:getMovieLibraryStatus:library:${tmdbId}`,
			);
			return {
				anilistId: input.anilistId,
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		if (liveMovie) {
			let cacheMutated = false;
			if (!existsInCache) {
				await this.addMovieToCache(liveMovie);
				cacheMutated = true;
			}

			if (cacheMutated) {
				await notifyLibraryMutation(
					"RadarrLibrary:notifyLibraryMutation",
					this.emitLibraryMutation,
					{
						tmdbId,
						action: "added",
					},
				);
			}

			return {
				anilistId: input.anilistId,
				provider: "radarr",
				providerId: tmdbId,
				isInLibrary: true,
				movie: liveMovie,
			};
		}

		let lookupMovie: RadarrLookupMovie | null = null;
		try {
			lookupMovie = await this.radarrClient.lookupMovieByTmdbId(
				tmdbId,
				credentials,
			);
		} catch (error) {
			logError(
				normalizeError(error),
				`RadarrLibrary:getMovieLibraryStatus:lookup:${tmdbId}`,
			);
		}

		if (existsInCache) {
			await this.removeMovieFromCache(tmdbId);
			await notifyLibraryMutation(
				"RadarrLibrary:notifyLibraryMutation",
				this.emitLibraryMutation,
				{
					tmdbId,
					action: "removed",
				},
			);
		}

		return {
			anilistId: input.anilistId,
			provider: "radarr",
			providerId: tmdbId,
			isInLibrary: false,
			...(lookupMovie ? { movie: lookupMovie } : {}),
		};
	}

	async getMovieStatus(
		payload: RadarrStatusPayload,
		options: LibraryStatusOptions = {},
	): Promise<CheckMovieStatusResponse> {
		this.logMovieStatusStart(payload, options);

		const radarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			radarrOptions,
			"radarr",
		);

		if (!isConfigured) {
			return {
				providerId: null,
				providerMappingState: "unknown",
				isInLibrary: null,
				mappingUnknownReason: "provider-not-configured",
			};
		}

		if (options.network === "never") {
			return {
				providerId: null,
				providerMappingState: "unknown",
				isInLibrary: null,
				mappingUnknownReason: "network-disabled",
			};
		}

		const mapping = await this.resolveMovieMapping(
			payload,
			payload.title?.trim(),
			options,
		);
		if (mapping.kind === "failed") return mapping.response;
		if (mapping.kind === "unmapped") return this.resolveUnmappedMovie(payload);

		return this.buildMappedMovieStatus(payload.anilistId, mapping, options);
	}

	private async resolveUnmappedMovie(
		payload: RadarrStatusPayload,
	): Promise<CheckMovieStatusResponse> {
		const unresolved = await this.resolveUnknownMovieOutcome(payload.anilistId);
		if (import.meta.env.DEV) {
			console.debug(
				`[ani2arr | RadarrLibrary] status:result anilistId=${payload.anilistId} outcome=unresolved`,
			);
		}
		return {
			providerId: null,
			isInLibrary: null,
			...unresolved,
		};
	}

	private async buildMappedMovieStatus(
		anilistId: AniListId,
		mapping: Extract<RadarrMappingResult, { kind: "mapped" }>,
		options: LibraryStatusOptions,
	): Promise<CheckMovieStatusResponse> {
		const libraryStatus = await this.getMovieLibraryStatus({
			anilistId,
			providerId: mapping.tmdbId,
			forceVerify: options.force_verify === true,
		});
		const status = buildMovieStatusResponseFromLibraryStatus({
			providerId: mapping.tmdbId,
			...(mapping.mappingSource
				? { mappingSource: mapping.mappingSource }
				: {}),
			...(mapping.mappingReason
				? { mappingReason: mapping.mappingReason }
				: {}),
			libraryStatus,
		});
		const linkedAniListIds = this.getLinkedAniListIds(mapping.tmdbId);

		return {
			...status,
			...(mapping.successfulSynonym
				? { successfulSynonym: mapping.successfulSynonym }
				: {}),
			...(linkedAniListIds ? { linkedAniListIds } : {}),
		};
	}

	private logMovieStatusStart(
		payload: RadarrStatusPayload,
		options: LibraryStatusOptions,
	): void {
		if (!import.meta.env.DEV) return;

		const priority = options.priority ?? "normal";
		const network = options.network ?? "allow";
		console.debug(
			`[ani2arr | RadarrLibrary] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
		);
	}

	private async resolveMovieMapping(
		payload: RadarrStatusPayload,
		normalizedTitle: string | undefined,
		options: LibraryStatusOptions,
	): Promise<RadarrMappingResult> {
		if (options.priority === "high") {
			try {
				this.mappingService.prioritizeAniListMedia?.(payload.anilistId, {
					schedule: false,
				});
			} catch {
				// best-effort
			}
		}

		try {
			this.logMovieLookupStart(payload, options);
			const mapping = await this.mappingService.resolveProviderId(
				"radarr",
				payload.anilistId,
				this.buildMappingOptions(payload, normalizedTitle, options),
			);
			if (!mapping) return { kind: "unmapped" };

			return {
				kind: "mapped",
				tmdbId: mapping.providerId,
				...(mapping.successfulSynonym
					? { successfulSynonym: mapping.successfulSynonym }
					: {}),
				mappingReason: mapping.reason,
				mappingSource: this.resolveMappingSource(mapping.reason),
			};
		} catch (error) {
			const response = this.toMovieMappingErrorResponse(error, payload);
			return { kind: "failed", response };
		}
	}

	private buildMappingOptions(
		payload: RadarrStatusPayload,
		normalizedTitle: string | undefined,
		options: LibraryStatusOptions,
	): AutoMappingOptions {
		const mappingOptions: AutoMappingOptions = {};
		if (options.priority) mappingOptions.priority = options.priority;
		if (options.force_verify) mappingOptions.forceLookupNetwork = true;

		const hints: NonNullable<AutoMappingOptions["hints"]> = {};
		if (normalizedTitle) hints.primaryTitle = normalizedTitle;
		if (payload.metadata) hints.domMedia = payload.metadata;
		if (Object.keys(hints).length > 0) mappingOptions.hints = hints;
		return mappingOptions;
	}

	private logMovieLookupStart(
		payload: RadarrStatusPayload,
		options: LibraryStatusOptions,
	): void {
		if (!import.meta.env.DEV) return;

		console.debug(
			`[ani2arr | RadarrLibrary] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? "normal"} network=${options.network ?? "allow"} force_verify=${String(options.force_verify === true)}`,
		);
	}

	private toMovieMappingErrorResponse(
		error: unknown,
		payload: RadarrStatusPayload,
	): CheckMovieStatusResponse {
		const normalized = normalizeError(error);
		if (
			normalized.code === ErrorCode.CONFIGURATION_ERROR ||
			(normalized.code === ErrorCode.VALIDATION_ERROR &&
				normalized.details?.reason === "network-disabled")
		) {
			return {
				providerId: null,
				providerMappingState: "unknown",
				isInLibrary: null,
				mappingUnknownReason:
					normalized.details?.reason === "network-disabled"
						? "network-disabled"
						: "provider-not-configured",
			};
		}

		logError(normalized, `RadarrLibrary:getMovieStatus:${payload.anilistId}`);
		return {
			providerId: null,
			providerMappingState: "unknown",
			isInLibrary: null,
			mappingUnknownReason: "lookup-failed",
		};
	}

	private resolveMappingSource(
		reason: NonNullable<CheckMovieStatusResponse["mappingReason"]>,
	): NonNullable<CheckMovieStatusResponse["mappingSource"]> {
		switch (reason) {
			case "manual-override": {
				return "manual";
			}
			case "exact-upstream": {
				return "upstream";
			}
			default: {
				return "auto";
			}
		}
	}

	private async resolveUnknownMovieOutcome(
		anilistId: AniListId,
	): Promise<
		Pick<
			CheckMovieStatusResponse,
			"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
		>
	> {
		const resolverState = await this.mappingService.getAutoMapping(
			"radarr",
			anilistId,
		);
		if (resolverState?.state === "ambiguous") {
			return {
				providerMappingState: "unknown",
				mappingUnknownReason: "ambiguous",
				resolverOutcome: "ambiguous",
			};
		}
		return {
			providerMappingState: "unmapped",
			...(resolverState?.state === "unresolved"
				? { resolverOutcome: "unresolved" as const }
				: {}),
		};
	}

	private getLinkedAniListIds(tmdbId: TmdbId): number[] | undefined {
		const linked = new Set<number>(
			this.manualMappingService.getLinkedAniListIds("radarr", tmdbId),
		);
		for (const id of this.anibridgeMappingStore.getAniListIdsForTmdb(tmdbId)) {
			linked.add(id);
		}
		return linked.size > 0 ? [...linked] : undefined;
	}

	private toMovieSnapshot(movie: RadarrMovie): RadarrMovieSnapshot {
		const alternateTitles = Array.isArray(movie.alternateTitles)
			? movie.alternateTitles
					.map((entry) => entry?.title?.trim())
					.filter((value): value is string => !!value)
			: undefined;

		return {
			id: movie.id,
			tmdbId: movie.tmdbId,
			title: movie.title,
			...(movie.titleSlug === undefined ? {} : { titleSlug: movie.titleSlug }),
			...(movie.sortTitle === undefined ? {} : { sortTitle: movie.sortTitle }),
			...(movie.originalTitle === undefined
				? {}
				: { originalTitle: movie.originalTitle }),
			...(movie.folderName === undefined
				? {}
				: { folderName: movie.folderName }),
			...(movie.imdbId === undefined ? {} : { imdbId: movie.imdbId }),
			...(movie.year === undefined ? {} : { year: movie.year }),
			...(alternateTitles === undefined ? {} : { alternateTitles }),
			...(movie.monitored === undefined ? {} : { monitored: movie.monitored }),
			...(movie.minimumAvailability === undefined
				? {}
				: { minimumAvailability: movie.minimumAvailability }),
			...(movie.hasFile === undefined ? {} : { hasFile: movie.hasFile }),
			...(movie.sizeOnDisk === undefined
				? {}
				: { sizeOnDisk: movie.sizeOnDisk }),
			...(movie.status === undefined ? {} : { status: movie.status }),
		};
	}
}
