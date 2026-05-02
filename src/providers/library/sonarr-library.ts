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
import type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
	TvdbId,
} from "@/providers";
import { notifyLibraryMutation } from "./notify-library-mutation";
import type {
	LibraryMutationEmitter,
	LibraryStatusOptions,
	ProviderLibraryCaches,
	SonarrLibraryStatus,
} from "./types";
import { PROVIDER_LIBRARY_CACHE_TTL } from "./cache";

const CACHE_KEY = "sonarr:lean-series";

type SonarrLibraryMutationPayload = {
	tvdbId: TvdbId;
	action: "added" | "removed";
};

type SonarrStatusPayload = Pick<
	StatusInput,
	"anilistId" | "title" | "metadata"
>;

type SonarrMappingResult =
	| {
			kind: "mapped";
			tvdbId: TvdbId;
			successfulSynonym?: string;
			mappingReason?: CheckSeriesStatusResponse["mappingReason"];
			mappingSource?: CheckSeriesStatusResponse["mappingSource"];
	  }
	| { kind: "unmapped" }
	| { kind: "failed"; response: CheckSeriesStatusResponse };

type SonarrLibraryDeps = {
	sonarrClient: SonarrClient;
	mappingService: Pick<
		MappingService,
		"resolveProviderId" | "prioritizeAniListMedia" | "getAutoMapping"
	>;
	manualMappingService: Pick<ManualMappingService, "getLinkedAniListIds">;
	anibridgeMappingStore: Pick<AnibridgeMappingStore, "getAniListIdsForTvdb">;
	caches: ProviderLibraryCaches<SonarrSeriesSnapshot>;
	emitLibraryMutation?: LibraryMutationEmitter<SonarrLibraryMutationPayload>;
};

export class SonarrLibrary {
	private inflightRefresh: Promise<SonarrSeriesSnapshot[]> | null = null;
	private readonly sonarrClient: SonarrClient;
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
		"getAniListIdsForTvdb"
	>;
	private readonly caches: ProviderLibraryCaches<SonarrSeriesSnapshot>;
	private readonly emitLibraryMutation:
		| LibraryMutationEmitter<SonarrLibraryMutationPayload>
		| undefined;

	constructor(deps: SonarrLibraryDeps) {
		this.sonarrClient = deps.sonarrClient;
		this.mappingService = deps.mappingService;
		this.manualMappingService = deps.manualMappingService;
		this.anibridgeMappingStore = deps.anibridgeMappingStore;
		this.caches = deps.caches;
		this.emitLibraryMutation = deps.emitLibraryMutation;
	}

	async getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]> {
		const cached = await this.caches.lean.read(CACHE_KEY);
		if (cached) {
			if (cached.stale && !this.inflightRefresh) {
				this.refreshCache().catch((error) => {
					logError(normalizeError(error), `SonarrLibrary:backgroundRefresh`);
				});
			}
			return cached.value;
		}
		return this.refreshCache();
	}

	async refreshCache(
		optionsOverride?: ExtensionOptions,
	): Promise<SonarrSeriesSnapshot[]> {
		if (this.inflightRefresh) return this.inflightRefresh;

		this.inflightRefresh = (async () => {
			const cached = await this.caches.lean.read(CACHE_KEY);
			const fallbackList = cached?.value ?? [];

			try {
				const options =
					optionsOverride ?? (await getExtensionOptionsSnapshot());
				const credentials = getProviderCredentials(options, "sonarr");

				if (!credentials) {
					await this.caches.lean.remove(CACHE_KEY);
					return [];
				}

				const fullEntries = await this.sonarrClient.getAllSeries(credentials);
				const snapshots = fullEntries
					.filter(
						(series) =>
							typeof series.tvdbId === "number" &&
							Number.isFinite(series.tvdbId),
					)
					.map((series) => this.toSeriesSnapshot(series));

				await this.caches.lean.write(
					CACHE_KEY,
					snapshots,
					PROVIDER_LIBRARY_CACHE_TTL.normal,
				);
				return snapshots;
			} catch (error) {
				const normalized = normalizeError(error);
				logError(normalized, `SonarrLibrary:refreshCache`);
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

	async addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
		const current = await this.getLeanSeriesList();
		const snapshot = this.toSeriesSnapshot(newSeries);
		const idx = current.findIndex((item) => item.tvdbId === snapshot.tvdbId);
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

	async removeSeriesFromCache(tvdbId: TvdbId): Promise<void> {
		const current = await this.getLeanSeriesList();
		const filtered = current.filter((item) => item.tvdbId !== tvdbId);
		if (filtered.length === current.length) return;

		await this.caches.lean.write(
			CACHE_KEY,
			filtered,
			PROVIDER_LIBRARY_CACHE_TTL.normal,
		);
	}

	async getSeriesLibraryStatus(input: {
		anilistId: AniListId;
		providerId: TvdbId;
		forceVerify?: boolean;
	}): Promise<SonarrLibraryStatus> {
		const leanList = await this.getLeanSeriesList();
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
				await this.addSeriesToCache(liveSeries);
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
			await this.removeSeriesFromCache(tvdbId);
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
		payload: SonarrStatusPayload,
		options: LibraryStatusOptions = {},
	): Promise<CheckSeriesStatusResponse> {
		this.logSeriesStatusStart(payload, options);

		const sonarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			sonarrOptions,
			"sonarr",
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

		const mapping = await this.resolveSeriesMapping(
			payload,
			payload.title?.trim(),
			options,
		);
		if (mapping.kind === "failed") return mapping.response;
		if (mapping.kind === "unmapped") return this.resolveUnmappedSeries(payload);

		return this.buildMappedSeriesStatus(payload.anilistId, mapping, options);
	}

	private async resolveUnmappedSeries(
		payload: SonarrStatusPayload,
	): Promise<CheckSeriesStatusResponse> {
		const unresolved = await this.resolveUnknownSeriesOutcome(
			payload.anilistId,
		);
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

	private async buildMappedSeriesStatus(
		anilistId: AniListId,
		mapping: Extract<SonarrMappingResult, { kind: "mapped" }>,
		options: LibraryStatusOptions,
	): Promise<CheckSeriesStatusResponse> {
		const libraryStatus = await this.getSeriesLibraryStatus({
			anilistId,
			providerId: mapping.tvdbId,
			forceVerify: options.force_verify === true,
		});
		const status = buildSeriesStatusResponseFromLibraryStatus({
			providerId: mapping.tvdbId,
			...(mapping.mappingSource
				? { mappingSource: mapping.mappingSource }
				: {}),
			...(mapping.mappingReason
				? { mappingReason: mapping.mappingReason }
				: {}),
			libraryStatus,
		});
		const linkedAniListIds = this.getLinkedAniListIds(mapping.tvdbId);

		return {
			...status,
			...(mapping.successfulSynonym
				? { successfulSynonym: mapping.successfulSynonym }
				: {}),
			...(linkedAniListIds ? { linkedAniListIds } : {}),
		};
	}

	private logSeriesStatusStart(
		payload: SonarrStatusPayload,
		options: LibraryStatusOptions,
	): void {
		if (!import.meta.env.DEV) return;

		const priority = options.priority ?? "normal";
		const network = options.network ?? "allow";
		console.debug(
			`[ani2arr | SonarrLibrary] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
		);
	}

	private async resolveSeriesMapping(
		payload: SonarrStatusPayload,
		normalizedTitle: string | undefined,
		options: LibraryStatusOptions,
	): Promise<SonarrMappingResult> {
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
			this.logSeriesLookupStart(payload, options);
			const mapping = await this.mappingService.resolveProviderId(
				"sonarr",
				payload.anilistId,
				this.buildMappingOptions(payload, normalizedTitle, options),
			);
			if (!mapping) return { kind: "unmapped" };

			return {
				kind: "mapped",
				tvdbId: mapping.providerId,
				...(mapping.successfulSynonym
					? { successfulSynonym: mapping.successfulSynonym }
					: {}),
				mappingReason: mapping.reason,
				mappingSource: this.resolveMappingSource(mapping.reason),
			};
		} catch (error) {
			const response = this.toSeriesMappingErrorResponse(error, payload);
			return { kind: "failed", response };
		}
	}

	private buildMappingOptions(
		payload: SonarrStatusPayload,
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

	private logSeriesLookupStart(
		payload: SonarrStatusPayload,
		options: LibraryStatusOptions,
	): void {
		if (!import.meta.env.DEV) return;

		console.debug(
			`[ani2arr | SonarrLibrary] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? "normal"} network=${options.network ?? "allow"} force_verify=${String(options.force_verify === true)}`,
		);
	}

	private toSeriesMappingErrorResponse(
		error: unknown,
		payload: SonarrStatusPayload,
	): CheckSeriesStatusResponse {
		const normalized = normalizeError(error);
		if (
			normalized.code === ErrorCode.CONFIGURATION_ERROR ||
			normalized.code === ErrorCode.SONARR_NOT_CONFIGURED ||
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

		logError(normalized, `SonarrLibrary:getSeriesStatus:${payload.anilistId}`);
		return {
			providerId: null,
			providerMappingState: "unknown",
			isInLibrary: null,
			mappingUnknownReason: "lookup-failed",
		};
	}

	private resolveMappingSource(
		reason: NonNullable<CheckSeriesStatusResponse["mappingReason"]>,
	): NonNullable<CheckSeriesStatusResponse["mappingSource"]> {
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

	private async resolveUnknownSeriesOutcome(
		anilistId: AniListId,
	): Promise<
		Pick<
			CheckSeriesStatusResponse,
			"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
		>
	> {
		const resolverState = await this.mappingService.getAutoMapping(
			"sonarr",
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

	private getLinkedAniListIds(tvdbId: TvdbId): number[] | undefined {
		const linked = new Set<number>(
			this.manualMappingService.getLinkedAniListIds("sonarr", tvdbId),
		);
		for (const id of this.anibridgeMappingStore.getAniListIdsForTvdb(tvdbId)) {
			linked.add(id);
		}
		return linked.size > 0 ? [...linked] : undefined;
	}

	private toSeriesSnapshot(series: SonarrSeries): SonarrSeriesSnapshot {
		const alternateTitles = Array.isArray(series.alternateTitles)
			? series.alternateTitles
					.map((entry) => entry?.title?.trim())
					.filter((value): value is string => !!value)
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
