/** Radarr-backed library cache and status lookup logic for movie records. */
// src/providers/library/radarr-library.ts

import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { AniListId } from "@/anilist";
import type { StatusInput } from "@/rpc/schemas";
import type { CheckMovieStatusResponse } from "@/rpc/types";
import { buildMovieStatusResponseFromLibraryStatus } from "@/providers/library/status-response-adapter";
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
import {
	type ProviderCredentials,
	type RadarrLookupMovie,
	type RadarrMovie,
	type RadarrMovieSnapshot,
	type TmdbId,
} from "@/providers";
import { BaseProviderLibraryStore } from "./base-provider-library.store";
import { notifyLibraryMutation } from "./notify-library-mutation";
import type {
	LibraryMutationEmitter,
	LibraryStatusOptions,
	ProviderLibraryCaches,
	RadarrLibraryStatus,
} from "./types";
import type { AnibridgeMappingStore } from "@/mapping/upstream-mapping";

const CACHE_KEY = "radarr:lean-movies";

type RadarrLibraryMutationPayload = {
	tmdbId: TmdbId;
	action: "added" | "removed";
};

export class RadarrLibrary {
	private readonly store: BaseProviderLibraryStore<
		RadarrMovie,
		RadarrMovieSnapshot,
		TmdbId
	>;

	constructor(
		private readonly radarrClient: RadarrClient,
		private readonly mappingService: Pick<
			MappingService,
			"resolveProviderId" | "prioritizeAniListMedia" | "getAutoMapping"
		>,
		private readonly manualMappingService: Pick<
			ManualMappingService,
			"getLinkedAniListIds"
		>,
		private readonly anibridgeMappingStore: Pick<
			AnibridgeMappingStore,
			"getAniListIdsForTmdb"
		>,
		caches: ProviderLibraryCaches<RadarrMovieSnapshot>,
		private readonly emitLibraryMutation?: LibraryMutationEmitter<RadarrLibraryMutationPayload>,
	) {
		this.store = new BaseProviderLibraryStore(
			caches,
			{
				cacheKey: CACHE_KEY,
				getCredentials: (options) => getProviderCredentials(options, "radarr"),
				fetchAll: async (credentials: ProviderCredentials) => {
					const full = await this.radarrClient.getAllMovies(credentials);
					return full.filter(
						(movie) =>
							typeof movie.tmdbId === "number" && Number.isFinite(movie.tmdbId),
					);
				},
				toSnapshot: (movie: RadarrMovie) => this.toMovieSnapshot(movie),
				getProviderId: (snapshot: RadarrMovieSnapshot) => snapshot.tmdbId,
			},
			"RadarrLibraryStore",
		);
	}

	getLeanMovieList(): Promise<RadarrMovieSnapshot[]> {
		return this.store.getLeanList();
	}

	refreshCache(
		optionsOverride?: ExtensionOptions,
	): Promise<RadarrMovieSnapshot[]> {
		return this.store.refreshCache(optionsOverride);
	}

	addMovieToCache(newMovie: RadarrMovie): Promise<void> {
		return this.store.addToCache(newMovie);
	}

	removeMovieFromCache(tmdbId: TmdbId): Promise<void> {
		return this.store.removeFromCache(tmdbId);
	}

	async getMovieLibraryStatus(input: {
		anilistId: AniListId;
		providerId: TmdbId;
		forceVerify?: boolean;
	}): Promise<RadarrLibraryStatus> {
		const leanList = await this.store.getLeanList();
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
				await this.store.addToCache(liveMovie);
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
			await this.store.removeFromCache(tmdbId);
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
		payload: Pick<StatusInput, "anilistId" | "title" | "metadata">,
		options: LibraryStatusOptions = {},
	): Promise<CheckMovieStatusResponse> {
		const resolveMappingSource = (
			reason: NonNullable<CheckMovieStatusResponse["mappingReason"]>,
		) => {
			switch (reason) {
				case "manual-override": {
					return "manual" as const;
				}
				case "exact-upstream": {
					return "upstream" as const;
				}
				default: {
					return "auto" as const;
				}
			}
		};
		const resolveUnknownOutcome = async (): Promise<
			Pick<
				CheckMovieStatusResponse,
				"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
			>
		> => {
			const resolverState = await this.mappingService.getAutoMapping(
				"radarr",
				payload.anilistId,
			);
			if (resolverState?.state === "ambiguous") {
				return {
					providerMappingState: "unknown",
					mappingUnknownReason: "ambiguous",
					resolverOutcome: "ambiguous",
				};
			}
			if (resolverState?.state === "verification-failed") {
				return {
					providerMappingState: "unknown",
					mappingUnknownReason: "verification-failed",
					resolverOutcome: "verification-failed",
				};
			}
			return {
				providerMappingState: "unmapped",
				...(resolverState?.state === "unresolved"
					? { resolverOutcome: "unresolved" as const }
					: {}),
			};
		};
		if (import.meta.env.DEV) {
			const priority = options.priority ?? "normal";
			const network = options.network ?? "allow";
			console.debug(
				`[ani2arr | RadarrLibrary] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
			);
		}

		const radarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			radarrOptions,
			"radarr",
		);

		const normalizedTitle = payload.title?.trim();
		let tmdbId: TmdbId | null = null;
		let successfulSynonym: string | undefined;
		let mappingReason: CheckMovieStatusResponse["mappingReason"];
		let mappingSource: CheckMovieStatusResponse["mappingSource"];
		let linkedAniListIds: number[] | undefined;

		if (tmdbId === null) {
			if (options.priority === "high") {
				try {
					this.mappingService.prioritizeAniListMedia?.(payload.anilistId, {
						schedule: false,
					});
				} catch {
					// best-effort
				}
			}

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

			const mappingOptions: AutoMappingOptions = {};
			if (options.ignoreFailureCache) {
				mappingOptions.ignoreFailureCache = true;
				mappingOptions.forceLookupNetwork = true;
			}
			if (options.priority) mappingOptions.priority = options.priority;
			if (options.force_verify) mappingOptions.forceLookupNetwork = true;

			const hints: NonNullable<AutoMappingOptions["hints"]> = {};
			if (normalizedTitle) hints.primaryTitle = normalizedTitle;
			if (payload.metadata) hints.domMedia = payload.metadata;
			if (Object.keys(hints).length > 0) mappingOptions.hints = hints;

			try {
				if (import.meta.env.DEV) {
					console.debug(
						`[ani2arr | RadarrLibrary] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? "normal"} network=${options.network ?? "allow"} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
					);
				}

				const mapping = await this.mappingService.resolveProviderId(
					"radarr",
					payload.anilistId,
					mappingOptions,
				);
				if (mapping) {
					tmdbId = mapping.providerId;
					successfulSynonym = mapping.successfulSynonym;
					mappingReason = mapping.reason;
					mappingSource = resolveMappingSource(mapping.reason);
				}
			} catch (error) {
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
				logError(
					normalized,
					`RadarrLibrary:getMovieStatus:${payload.anilistId}`,
				);
				return {
					providerId: null,
					providerMappingState: "unknown",
					isInLibrary: null,
					mappingUnknownReason: "lookup-failed",
				};
			}
		}

		if (tmdbId === null) {
			const unresolved = await resolveUnknownOutcome();
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

		const linked = new Set<number>(
			this.manualMappingService.getLinkedAniListIds("radarr", tmdbId),
		);
		for (const id of this.anibridgeMappingStore.getAniListIdsForTmdb(tmdbId)) {
			linked.add(id);
		}
		if (linked.size > 0) {
			linkedAniListIds = [...linked];
		}

		const libraryStatus = await this.getMovieLibraryStatus({
			anilistId: payload.anilistId,
			providerId: tmdbId,
			forceVerify: options.force_verify === true,
		});

		const status = buildMovieStatusResponseFromLibraryStatus({
			providerId: tmdbId,
			...(mappingSource ? { mappingSource } : {}),
			...(mappingReason ? { mappingReason } : {}),
			libraryStatus,
		});

		return {
			...status,
			...(successfulSynonym ? { successfulSynonym } : {}),
			...(linkedAniListIds ? { linkedAniListIds } : {}),
		};
	}

	private toMovieSnapshot(movie: RadarrMovie): RadarrMovieSnapshot {
		const alternateTitles = Array.isArray(movie.alternateTitles)
			? movie.alternateTitles
					.map((entry) => entry?.title?.trim())
					.filter(
						(value): value is string => value !== undefined && value !== "",
					)
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
