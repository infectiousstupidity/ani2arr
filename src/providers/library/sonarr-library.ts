/** Sonarr-backed library cache and status lookup logic for series records. */
// src/providers/library/sonarr-library.ts

import type { SonarrClient } from "@/providers/clients/sonarr.client";
import type { AniListId } from "@/anilist";
import type { StatusInput } from "@/rpc/schemas";
import type { CheckSeriesStatusResponse } from "@/rpc/types";
import { buildSeriesStatusResponseFromLibraryStatus } from "@/providers/library/status-response-adapter";
import type { MappingService } from "@/mapping/mapping.service";
import type { ManualMappingService } from "@/mapping/manual-mapping";
import type { AutoMappingOptions } from "@/mapping/auto-mapping/types";
import type { AnibridgeMappingStore } from "@/mapping/upstream-mapping";
import { ErrorCode, logError, normalizeError } from "@/shared/errors";
import {
	getExtensionOptionsSnapshot,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	type ExtensionOptions,
} from "@/options";
import {
	type ProviderCredentials,
	type SonarrLookupSeries,
	type SonarrSeries,
	type SonarrSeriesSnapshot,
	type TvdbId,
} from "@/providers";
import { BaseProviderLibraryStore } from "./base-provider-library.store";
import { notifyLibraryMutation } from "./notify-library-mutation";
import type {
	LibraryMutationEmitter,
	LibraryStatusOptions,
	ProviderLibraryCaches,
	SonarrLibraryStatus,
} from "./types";

const CACHE_KEY = "sonarr:lean-series";

type SonarrLibraryMutationPayload = {
	tvdbId: TvdbId;
	action: "added" | "removed";
};

export class SonarrLibrary {
	private readonly store: BaseProviderLibraryStore<
		SonarrSeries,
		SonarrSeriesSnapshot,
		TvdbId
	>;

	constructor(
		private readonly sonarrClient: SonarrClient,
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
			"getAniListIdsForTvdb"
		>,
		caches: ProviderLibraryCaches<SonarrSeriesSnapshot>,
		private readonly emitLibraryMutation?: LibraryMutationEmitter<SonarrLibraryMutationPayload>,
	) {
		this.store = new BaseProviderLibraryStore(
			caches,
			{
				cacheKey: CACHE_KEY,
				getCredentials: (options) => getProviderCredentials(options, "sonarr"),
				fetchAll: async (credentials: ProviderCredentials) => {
					const full = await this.sonarrClient.getAllSeries(credentials);
					return full.filter(
						(series) =>
							typeof series.tvdbId === "number" &&
							Number.isFinite(series.tvdbId),
					);
				},
				toSnapshot: (series: SonarrSeries) => this.toSeriesSnapshot(series),
				getProviderId: (snapshot: SonarrSeriesSnapshot) => snapshot.tvdbId,
			},
			"SonarrLibraryStore",
		);
	}

	getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]> {
		return this.store.getLeanList();
	}

	refreshCache(
		optionsOverride?: ExtensionOptions,
	): Promise<SonarrSeriesSnapshot[]> {
		return this.store.refreshCache(optionsOverride);
	}

	addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
		return this.store.addToCache(newSeries);
	}

	removeSeriesFromCache(tvdbId: TvdbId): Promise<void> {
		return this.store.removeFromCache(tvdbId);
	}

	async getSeriesLibraryStatus(input: {
		anilistId: AniListId;
		providerId: TvdbId;
		forceVerify?: boolean;
	}): Promise<SonarrLibraryStatus> {
		const leanList = await this.store.getLeanList();
		const sonarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			sonarrOptions,
			"sonarr",
		);
		const tvdbId = input.providerId;
		const cachedSeries =
			leanList.find((series) => series.tvdbId === tvdbId) ?? null;
		const existsInCache = cachedSeries !== null;

		if (!isConfigured || input.forceVerify !== true) {
			return {
				anilistId: input.anilistId,
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: existsInCache,
				...(cachedSeries ? { series: cachedSeries } : {}),
			};
		}

		const credentials = getProviderCredentials(sonarrOptions, "sonarr")!;
		let liveSeries: SonarrSeries | null = null;
		try {
			liveSeries = await this.sonarrClient.getSeriesByTvdbId(
				tvdbId,
				credentials,
			);
		} catch (error) {
			logError(
				normalizeError(error),
				`SonarrLibrary:getSeriesLibraryStatus:library:${tvdbId}`,
			);
			return {
				anilistId: input.anilistId,
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		if (liveSeries) {
			let cacheMutated = false;
			if (!existsInCache) {
				await this.store.addToCache(liveSeries);
				cacheMutated = true;
			}

			if (cacheMutated) {
				await notifyLibraryMutation(
					"SonarrLibrary:notifyLibraryMutation",
					this.emitLibraryMutation,
					{
						tvdbId,
						action: "added",
					},
				);
			}

			return {
				anilistId: input.anilistId,
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: true,
				series: liveSeries,
			};
		}

		let lookupSeries: SonarrLookupSeries | null = null;
		try {
			lookupSeries = await this.sonarrClient.lookupSeriesByTvdbId(
				tvdbId,
				credentials,
			);
		} catch (error) {
			logError(
				normalizeError(error),
				`SonarrLibrary:getSeriesLibraryStatus:lookup:${tvdbId}`,
			);
		}

		if (existsInCache) {
			await this.store.removeFromCache(tvdbId);
			await notifyLibraryMutation(
				"SonarrLibrary:notifyLibraryMutation",
				this.emitLibraryMutation,
				{
					tvdbId,
					action: "removed",
				},
			);
		}

		return {
			anilistId: input.anilistId,
			provider: "sonarr",
			providerId: tvdbId,
			isInLibrary: false,
			...(lookupSeries ? { series: lookupSeries } : {}),
		};
	}

	async getSeriesStatus(
		payload: Pick<StatusInput, "anilistId" | "title" | "metadata">,
		options: LibraryStatusOptions = {},
	): Promise<CheckSeriesStatusResponse> {
		const resolveMappingSource = (
			reason: NonNullable<CheckSeriesStatusResponse["mappingReason"]>,
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
				CheckSeriesStatusResponse,
				"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
			>
		> => {
			const resolverState = await this.mappingService.getAutoMapping(
				"sonarr",
				payload.anilistId,
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
		};
		if (import.meta.env.DEV) {
			const priority = options.priority ?? "normal";
			const network = options.network ?? "allow";
			console.debug(
				`[ani2arr | SonarrLibrary] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
			);
		}

		const sonarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			sonarrOptions,
			"sonarr",
		);

		const normalizedTitle = payload.title?.trim();
		let tvdbId: TvdbId | null = null;
		let successfulSynonym: string | undefined;
		let mappingReason: CheckSeriesStatusResponse["mappingReason"];
		let mappingSource: CheckSeriesStatusResponse["mappingSource"];
		let linkedAniListIds: number[] | undefined;

		if (tvdbId === null) {
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
			if (options.priority) mappingOptions.priority = options.priority;
			if (options.force_verify) mappingOptions.forceLookupNetwork = true;

			const hints: NonNullable<AutoMappingOptions["hints"]> = {};
			if (normalizedTitle) hints.primaryTitle = normalizedTitle;
			if (payload.metadata) hints.domMedia = payload.metadata;
			if (Object.keys(hints).length > 0) mappingOptions.hints = hints;

			try {
				if (import.meta.env.DEV) {
					console.debug(
						`[ani2arr | SonarrLibrary] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? "normal"} network=${options.network ?? "allow"} force_verify=${String(options.force_verify === true)}`,
					);
				}

				const mapping = await this.mappingService.resolveProviderId(
					"sonarr",
					payload.anilistId,
					mappingOptions,
				);
				if (mapping) {
					tvdbId = mapping.providerId;
					successfulSynonym = mapping.successfulSynonym;
					mappingReason = mapping.reason;
					mappingSource = resolveMappingSource(mapping.reason);
				}
			} catch (error) {
				const normalized = normalizeError(error);
				if (
					normalized.code === ErrorCode.CONFIGURATION_ERROR ||
					normalized.code === ErrorCode.SONARR_NOT_CONFIGURED ||
					(normalized.code === ErrorCode.VALIDATION_ERROR &&
						normalized.details?.reason === "network-disabled")
				) {
					return {
						providerId: null,
						providerMappingState:
							normalized.details?.reason === "network-disabled"
								? "unknown"
								: "unknown",
						isInLibrary: null,
						mappingUnknownReason:
							normalized.details?.reason === "network-disabled"
								? "network-disabled"
								: "provider-not-configured",
					};
				}
				logError(
					normalized,
					`SonarrLibrary:getSeriesStatus:${payload.anilistId}`,
				);
				return {
					providerId: null,
					providerMappingState: "unknown",
					isInLibrary: null,
					mappingUnknownReason: "lookup-failed",
				};
			}
		}

		if (tvdbId === null) {
			const unresolved = await resolveUnknownOutcome();
			if (import.meta.env.DEV) {
				console.debug(
					`[ani2arr | SonarrLibrary] status:result anilistId=${payload.anilistId} outcome=unresolved`,
				);
			}
			return {
				providerId: null,
				isInLibrary: null,
				...unresolved,
			};
		}

		const linked = new Set<number>(
			this.manualMappingService.getLinkedAniListIds("sonarr", tvdbId),
		);
		for (const id of this.anibridgeMappingStore.getAniListIdsForTvdb(tvdbId)) {
			linked.add(id);
		}
		if (linked.size > 0) {
			linkedAniListIds = [...linked];
		}

		const libraryStatus = await this.getSeriesLibraryStatus({
			anilistId: payload.anilistId,
			providerId: tvdbId,
			forceVerify: options.force_verify === true,
		});

		const status = buildSeriesStatusResponseFromLibraryStatus({
			providerId: tvdbId,
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

	private toSeriesSnapshot(series: SonarrSeries): SonarrSeriesSnapshot {
		const alternateTitles = Array.isArray(series.alternateTitles)
			? series.alternateTitles
					.map((entry) => entry?.title?.trim())
					.filter(
						(value): value is string => value !== undefined && value !== "",
					)
			: undefined;
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

		return {
			id: series.id,
			tvdbId: series.tvdbId,
			title: series.title,
			titleSlug: series.titleSlug,
			...(alternateTitles === undefined ? {} : { alternateTitles }),
			...(series.status === undefined ? {} : { status: series.status }),
			...(statistics === undefined ? {} : { statistics }),
		};
	}
}
