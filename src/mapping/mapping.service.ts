/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/mapping/mapping.service.ts

import type { AniListId, AniListMediaService } from "@/anilist";
import { incrementCounter } from "@/debug/metrics";
import {
	parseProviderIdentity,
	type Provider,
	type ProviderCredentials,
	type ProviderIdFor,
	type ProviderId,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import {
	logError,
	normalizeError,
} from "@/shared/errors";
import { logger } from "@/shared/utils/logger";
import { ManualMappingService } from "./manual-mapping";
import type {
	ProviderTitleLookup,
	ProviderTitleResult,
} from "./auto-mapping/lookup/provider-title-lookup";
import { resolveAutoMapping } from "./auto-mapping/resolve-auto-mapping";
import { AutoMappingPersistenceGuard } from "./auto-mapping/persistence-guard";
import { AutoMappingInflightRequests } from "./auto-mapping/inflight-requests";
import {
	MAPPED_AUTO_MAPPING_TTL,
	UNRESOLVED_AUTO_MAPPING_TTL,
	AutoMappingStore,
} from "./auto-mapping/auto-mapping.store";
import { shouldApplyCandidateSuppression } from "./resolution-policy";
import { AnibridgeMappingStore } from "./upstream-mapping";
import { buildEffectiveMapping } from "./effective-mapping";
import type { AcceptedMappingEvidence, AcceptedMappingSource } from "./types";
import type {
	AutoMappingSource,
	AutoMappingOptions,
	AcceptedAutoMappingResult,
	AutoMappingRecord,
} from "./auto-mapping/types";

type ProviderTitleLookupRegistry = Record<
	Provider,
	ProviderTitleLookup<ProviderTitleResult>
>;

type MappingServiceDeps = {
	anilistApi: AniListMediaService;
	anibridgeMappingStore: AnibridgeMappingStore;
	lookupClients: ProviderTitleLookupRegistry;
	autoMappingStore: AutoMappingStore;
	getConfiguredCredentials: (
		provider: Provider,
	) => Promise<ProviderCredentials>;
	manualMappings?: ManualMappingService;
	notifyMappingsChanged?: () => void;
};

type AniListPrioritizeApi = {
	prioritize: (
		ids: AniListId | AniListId[],
		options?: { schedule?: boolean },
	) => void;
};

type AniListCacheEvictApi = {
	removeMediaFromCache: (id: AniListId) => Promise<void>;
};

function canPrioritizeAniListMedia(
	api: AniListMediaService,
): api is AniListMediaService & AniListPrioritizeApi {
	return typeof (api as { prioritize?: unknown }).prioritize === "function";
}

function canEvictAniListMedia(
	api: AniListMediaService,
): api is AniListMediaService & AniListCacheEvictApi {
	return (
		typeof (api as { removeMediaFromCache?: unknown }).removeMediaFromCache ===
		"function"
	);
}

export class MappingService {
	private readonly log = logger.create("MappingService");
	private readonly anilistApi: AniListMediaService;
	private readonly anibridgeMappingStore: AnibridgeMappingStore;
	private readonly lookupClients: ProviderTitleLookupRegistry;
	private readonly autoMappingStore: AutoMappingStore;
	private readonly getConfiguredCredentials: (
		provider: Provider,
	) => Promise<ProviderCredentials>;
	private readonly manualMappings: ManualMappingService | undefined;
	private readonly notifyMappingsChanged: (() => void) | undefined;
	private readonly inflight = new AutoMappingInflightRequests();
	private readonly autoMappingPersistence = new AutoMappingPersistenceGuard();
	constructor(deps: MappingServiceDeps) {
		this.anilistApi = deps.anilistApi;
		this.anibridgeMappingStore = deps.anibridgeMappingStore;
		this.lookupClients = deps.lookupClients;
		this.autoMappingStore = deps.autoMappingStore;
		this.getConfiguredCredentials = deps.getConfiguredCredentials;
		this.manualMappings = deps.manualMappings;
		this.notifyMappingsChanged = deps.notifyMappingsChanged;
	}

	public async resetLookupState(provider?: Provider): Promise<void> {
		if (!provider) {
			this.autoMappingPersistence.invalidateProvider("sonarr");
			this.autoMappingPersistence.invalidateProvider("radarr");
			this.inflight.clear();
			await Promise.all([
				this.lookupClients.sonarr.reset(),
				this.lookupClients.radarr.reset(),
				this.autoMappingStore.clear(),
			]);
			this.notifyMappingsChanged?.();
			return;
		}

		this.autoMappingPersistence.invalidateProvider(provider);
		this.inflight.deleteProvider(provider);

		await Promise.all([
			this.lookupClients[provider].reset(),
			this.autoMappingStore.clear(provider),
		]);

		this.notifyMappingsChanged?.();
	}

	public initAnibridgeMappings(): Promise<void> {
		return this.anibridgeMappingStore.init();
	}

	public prioritizeAniListMedia(
		anilistId: AniListId,
		options?: { schedule?: boolean },
	): void {
		try {
			if (canPrioritizeAniListMedia(this.anilistApi)) {
				this.anilistApi.prioritize(anilistId, {
					schedule: options?.schedule === true,
				});
			}
		} catch {
			// best-effort; ignore failures
		}
	}

	public async resolveProviderId<P extends Provider>(
		provider: P,
		anilistId: AniListId,
		options: AutoMappingOptions = {},
	): Promise<
		(AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null
	> {
		if (import.meta.env.DEV) {
			this.log.debug?.(
				`mapping:start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? "normal"} network=${options.network ?? "allow"}`,
			);
		}

		const canPersistAutoMappingResult = this.autoMappingPersistence.createCheck(
			provider,
			anilistId,
		);
		const precedenceResult = await this.resolveAuthoritativeMapping(
			provider,
			anilistId,
			canPersistAutoMappingResult,
		);
		if (precedenceResult.handled) {
			return precedenceResult.resolved as
				| (AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> })
				| null;
		}

		const existing = this.inflight.get(provider, anilistId, options);
		if (existing) {
			return existing as Promise<
				(AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null
			>;
		}

		const promise = resolveAutoMapping(
			{
				anilistApi: this.anilistApi,
				lookupClients: this.lookupClients,
				autoMappingStore: this.autoMappingStore,
				log: this.log,
				acceptResolved: (
					resolvedProvider,
					resolvedAniListId,
					resolved,
					source,
				) => {
					if (!canPersistAutoMappingResult()) {
						return Promise.resolve(null);
					}
					return this.acceptResolved(
						resolvedProvider,
						resolvedAniListId,
						resolved,
						source,
					);
				},
				recordAutoMapping: (
					resolvedProvider,
					resolvedAniListId,
					state,
					ttl,
				) => {
					if (!canPersistAutoMappingResult()) {
						return Promise.resolve();
					}
					return this.recordAutoMapping(
						resolvedProvider,
						resolvedAniListId,
						state,
						ttl,
					);
				},
				clearAutoMapping: (resolvedProvider, resolvedAniListId) => {
					if (!canPersistAutoMappingResult()) {
						return Promise.resolve();
					}
					return this.clearAutoMapping(resolvedProvider, resolvedAniListId);
				},
				getConfiguredCredentials: (resolvedProvider) =>
					this.getConfiguredCredentials(resolvedProvider),
				isResolvedCandidateSuppressed: (
					resolvedProvider,
					resolvedAniListId,
					resolved,
					source,
				) =>
					this.isResolvedCandidateSuppressed(
						resolvedProvider,
						resolvedAniListId,
						resolved,
						source,
					),
			},
			provider,
			anilistId,
			options,
		);
		this.inflight.set(provider, anilistId, options, promise);

		return promise as Promise<
			(AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null
		>;
	}

	public getAutoMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<AutoMappingRecord | null> {
		return this.autoMappingStore.get(provider, anilistId);
	}

	private async resolveAuthoritativeMapping(
		provider: Provider,
		anilistId: AniListId,
		canPersistAutoMappingResult: () => boolean,
	): Promise<
		| { handled: true; resolved: AcceptedAutoMappingResult | null }
		| { handled: false }
	> {
		const manualProviderId =
			this.manualMappings?.get(provider, anilistId) ?? null;
		const upstreamProviderIds = this.getAnibridgeProviderIds(
			provider,
			anilistId,
		);
		const effectiveMapping = buildEffectiveMapping({
			provider,
			anilistId,
			manualProviderId,
			ignored: this.manualMappings?.isIgnored(provider, anilistId) ?? false,
			upstreamProviderIds,
			autoMappingRecord: null,
		});
		const clearAutoMappingIfCurrent = () =>
			canPersistAutoMappingResult()
				? this.clearAutoMapping(provider, anilistId)
				: Promise.resolve();
		const recordAmbiguousIfCurrent = () =>
			canPersistAutoMappingResult()
				? this.recordAutoMapping(
						provider,
						anilistId,
						{ state: "ambiguous" },
						UNRESOLVED_AUTO_MAPPING_TTL,
					)
				: Promise.resolve();

		if (effectiveMapping.mappingEntryKind === "ignored") {
			await clearAutoMappingIfCurrent();
			if (import.meta.env.DEV) {
				this.log.debug?.(
					`mapping:ignored provider=${provider} anilistId=${anilistId}`,
				);
			}
			return { handled: true, resolved: null };
		}

		if (
			effectiveMapping.mappingEntryKind === "manual" &&
			effectiveMapping.providerId !== null
		) {
			await clearAutoMappingIfCurrent();
			if (import.meta.env.DEV) {
				this.log.debug?.(
					`mapping:manual-mapping-hit provider=${provider} anilistId=${anilistId} providerId=${effectiveMapping.providerId}`,
				);
			}
			return {
				handled: true,
				resolved: {
					providerId: effectiveMapping.providerId,
					reason: "manual-override",
				},
			};
		}

		if (
			effectiveMapping.mappingEntryKind === "upstream" &&
			effectiveMapping.providerId !== null
		) {
			if (manualProviderId !== null) {
				try {
					await this.manualMappings?.clear(provider, anilistId);
				} catch (error) {
					logError(
						normalizeError(error),
						`MappingService:clearManualMapping:${provider}:${anilistId}`,
					);
				}
			}

			incrementCounter("mapping.lookup.static_hit");
			return {
				handled: true,
				resolved: {
					providerId: effectiveMapping.providerId,
					reason: "exact-upstream",
				},
			};
		}

		if (
			effectiveMapping.providerMappingState === "unknown" &&
			effectiveMapping.mappingUnknownReason === "ambiguous"
		) {
			await recordAmbiguousIfCurrent();
			return { handled: true, resolved: null };
		}

		return { handled: false };
	}

	private async acceptResolved(
		provider: Provider,
		anilistId: AniListId,
		resolved: AcceptedAutoMappingResult,
		source: AutoMappingSource,
	): Promise<AcceptedAutoMappingResult | null> {
		const mappedState: Omit<
			Extract<AutoMappingRecord, { state: "mapped" }>,
			"updatedAt"
		> = {
			state: "mapped",
			providerId: resolved.providerId,
			acceptedEvidence: buildAcceptedMappingEvidence(source, resolved),
		};

		try {
			await this.autoMappingStore.set(
				provider,
				anilistId,
				mappedState,
				MAPPED_AUTO_MAPPING_TTL,
			);
		} catch (error) {
			const normalized = normalizeError(error);
			this.log.error?.(
				`mapping:persist-resolved-failed provider=${provider} anilistId=${anilistId}`,
				normalized,
			);
			return null;
		}
		this.notifyMappingsChanged?.();
		return resolved;
	}

	private evictAniListMedia(anilistId: AniListId): void {
		try {
			if (canEvictAniListMedia(this.anilistApi)) {
				void this.anilistApi.removeMediaFromCache(anilistId).catch(() => {});
			}
		} catch {
			// best-effort eviction; ignore failures
		}
	}

	public async evictResolved(
		anilistId: AniListId,
		provider: Provider = "sonarr",
	): Promise<void> {
		this.autoMappingPersistence.invalidateEntry(provider, anilistId);
		this.inflight.delete(provider, anilistId);
		await this.autoMappingStore.delete(provider, anilistId);
		this.evictAniListMedia(anilistId);
		this.notifyMappingsChanged?.();
	}

	private async recordAutoMapping(
		provider: Provider,
		anilistId: AniListId,
		state: Omit<AutoMappingRecord, "updatedAt">,
		ttl: { hardMs: number },
	): Promise<void> {
		const changed = await this.autoMappingStore.set(
			provider,
			anilistId,
			state,
			ttl,
		);
		if (changed) {
			this.notifyMappingsChanged?.();
		}
	}

	private async clearAutoMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<void> {
		const changed = await this.autoMappingStore.delete(provider, anilistId);
		if (changed) {
			this.notifyMappingsChanged?.();
		}
	}

	private isCandidateSuppressed(
		provider: Provider,
		anilistId: AniListId,
		providerId: ProviderId,
	): boolean {
		const identity = parseProviderIdentity(provider, providerId);
		return (
			this.manualMappings?.getCandidateSuppression(
				identity.provider,
				anilistId,
				identity.providerId,
			) != null
		);
	}

	private isResolvedCandidateSuppressed(
		provider: Provider,
		anilistId: AniListId,
		resolved: AcceptedAutoMappingResult,
		source: AcceptedMappingSource,
	): boolean {
		return (
			shouldApplyCandidateSuppression(source, resolved.reason) &&
			this.isCandidateSuppressed(provider, anilistId, resolved.providerId)
		);
	}

	private getAnibridgeProviderIds(
		provider: "sonarr",
		anilistId: AniListId,
	): TvdbId[];
	private getAnibridgeProviderIds(
		provider: "radarr",
		anilistId: AniListId,
	): TmdbId[];
	private getAnibridgeProviderIds(
		provider: Provider,
		anilistId: AniListId,
	): ProviderId[];
	private getAnibridgeProviderIds(
		provider: Provider,
		anilistId: AniListId,
	): ProviderId[] {
		return provider === "sonarr"
			? this.anibridgeMappingStore.getSonarrCandidates(anilistId)
			: this.anibridgeMappingStore.getRadarrCandidates(anilistId);
	}
}

function buildAcceptedMappingEvidence(
	source: AcceptedMappingSource,
	resolved: AcceptedAutoMappingResult,
): AcceptedMappingEvidence {
	return {
		source,
		reason: resolved.reason,
		...(resolved.successfulSynonym
			? { successfulTitle: resolved.successfulSynonym }
			: {}),
	};
}

export { type AnibridgeMappingPayload } from "./upstream-mapping";
export { type AcceptedAutoMappingResult } from "./auto-mapping/types";
