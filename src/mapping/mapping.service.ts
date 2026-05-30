/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/mapping/mapping.service.ts

import type { AniListId, AniListMediaService } from "@/anilist";
import {
	type Provider,
	type ProviderCredentials,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import { ErrorCode, logError, normalizeError } from "@/shared/errors";
import { logger } from "@/shared/utils/logger";
import { ManualMappingService } from "./manual-mapping";
import type { ProviderTitleLookup } from "./auto-mapping/lookup/provider-title-lookup";
import { resolveAutoMapping } from "./auto-mapping/resolve-auto-mapping";
import { AutoMappingInflightRequests } from "./auto-mapping/inflight-requests";
import {
	MAPPED_AUTO_MAPPING_TTL,
	UNRESOLVED_AUTO_MAPPING_TTL,
	AutoMappingStore,
} from "./auto-mapping/auto-mapping.store";
import { shouldApplyCandidateSuppression } from "./resolution-policy";
import { AnibridgeMappingStore } from "./upstream-mapping";
import {
	buildEffectiveMapping,
	type EffectiveMapping,
} from "./effective-mapping";
import type { ProviderExternalId } from "./types";
import type {
	AutoMappingSource,
	AutoMappingOptions,
	AcceptedAutoMappingResult,
	AutoMappingRecord,
} from "./auto-mapping/types";

type ProviderTitleLookupRegistry = Record<Provider, ProviderTitleLookup>;

export type MappingServiceDeps = {
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

	// Generation tokens replace the over-engineered PersistenceGuard file
	private readonly providerGenerations: Record<Provider, number> = {
		sonarr: 0,
		radarr: 0,
	};
	private readonly entryGenerations = new Map<string, number>();

	constructor(deps: MappingServiceDeps) {
		this.anilistApi = deps.anilistApi;
		this.anibridgeMappingStore = deps.anibridgeMappingStore;
		this.lookupClients = deps.lookupClients;
		this.autoMappingStore = deps.autoMappingStore;
		this.getConfiguredCredentials = deps.getConfiguredCredentials;
		this.manualMappings = deps.manualMappings;
		this.notifyMappingsChanged = deps.notifyMappingsChanged;
	}

	private createValidityCheck(
		provider: Provider,
		anilistId: AniListId,
	): () => boolean {
		const key = `${provider}:${anilistId}`;
		const startProviderGen = this.providerGenerations[provider];
		const startEntryGen = this.entryGenerations.get(key) ?? 0;
		return () =>
			this.providerGenerations[provider] === startProviderGen &&
			(this.entryGenerations.get(key) ?? 0) === startEntryGen;
	}

	private invalidateProvider(provider: Provider): void {
		this.providerGenerations[provider]++;
	}

	private invalidateEntry(provider: Provider, anilistId: AniListId): void {
		const key = `${provider}:${anilistId}`;
		this.entryGenerations.set(key, (this.entryGenerations.get(key) ?? 0) + 1);
	}

	public async resetLookupState(provider?: Provider): Promise<void> {
		if (!provider) {
			this.invalidateProvider("sonarr");
			this.invalidateProvider("radarr");
			this.inflight.clear();
			await Promise.all([
				this.lookupClients.sonarr.reset(),
				this.lookupClients.radarr.reset(),
				this.autoMappingStore.clear(),
			]);
			this.notifyMappingsChanged?.();
			return;
		}

		this.invalidateProvider(provider);
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

	/**
	 * Unified point-read method. Centralizes precedence for UI Modals and Identities.
	 */
	public async getEffectiveMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<EffectiveMapping> {
		const manualList = this.manualMappings?.list(provider) ?? [];
		const manualMatch = manualList.find((m) => m.anilistId === anilistId);
		const manual = manualMatch
			? { providerId: manualMatch.providerId, updatedAt: manualMatch.updatedAt }
			: null;

		const ignoreList = this.manualMappings?.listIgnores(provider) ?? [];
		const ignoreMatch = ignoreList.find((m) => m.anilistId === anilistId);
		const ignored = ignoreMatch ? { updatedAt: ignoreMatch.updatedAt } : null;

		const rejectedList =
			this.manualMappings?.listRejectedCandidates(provider) ?? [];
		const rejectedMatch = rejectedList
			.filter((m) => m.anilistId === anilistId)
			.toSorted((a, b) => b.updatedAt - a.updatedAt)[0];
		const rejectedCandidate = rejectedMatch
			? {
					providerId: rejectedMatch.providerId,
					updatedAt: rejectedMatch.updatedAt,
				}
			: null;

		const upstreamProviderIds = this.getAnibridgeProviderIds(
			provider,
			anilistId,
		);
		const autoMappingRecord = await this.autoMappingStore.get(
			provider,
			anilistId,
		);

		return buildEffectiveMapping({
			provider,
			anilistId,
			manual,
			ignored,
			upstreamProviderIds,
			rejectedCandidate,
			autoMappingRecord,
		});
	}

	public async resolveProviderId(
		provider: "sonarr",
		anilistId: AniListId,
		options?: AutoMappingOptions,
	): Promise<(AcceptedAutoMappingResult & { providerId: TvdbId }) | null>;
	public async resolveProviderId(
		provider: "radarr",
		anilistId: AniListId,
		options?: AutoMappingOptions,
	): Promise<(AcceptedAutoMappingResult & { providerId: TmdbId }) | null>;
	public async resolveProviderId(
		provider: Provider,
		anilistId: AniListId,
		options: AutoMappingOptions = {},
	): Promise<AcceptedAutoMappingResult | null> {
		const isValid = this.createValidityCheck(provider, anilistId);

		const precedenceResult = await this.resolveAuthoritativeMapping(
			provider,
			anilistId,
			isValid,
		);
		if (precedenceResult.handled) {
			return precedenceResult.resolved;
		}

		const existing = this.inflight.get(provider, anilistId, options);
		if (existing) {
			return existing;
		}

		const promise = (async () => {
			try {
				const resolved = await resolveAutoMapping(
					{
						anilistApi: this.anilistApi,
						lookupClients: this.lookupClients,
						log: this.log,
						getConfiguredCredentials: (p) => this.getConfiguredCredentials(p),
						isCandidateSuppressed: (p, aId, pId, r) =>
							shouldApplyCandidateSuppression("auto", r) &&
							this.isCandidateSuppressed(p, aId, pId),
					},
					provider,
					anilistId,
					options,
				);

				if (!isValid()) return null;

				if (resolved) {
					return await this.acceptResolved(
						provider,
						anilistId,
						resolved,
						"auto",
					);
				}

				await this.recordAutoMapping(
					provider,
					anilistId,
					{ state: "unresolved" },
					UNRESOLVED_AUTO_MAPPING_TTL,
				);
				return null;
			} catch (error) {
				const normalized = normalizeError(error);
				if (normalized.code === ErrorCode.VALIDATION_ERROR && isValid()) {
					await this.recordAutoMapping(
						provider,
						anilistId,
						{ state: "unresolved" },
						UNRESOLVED_AUTO_MAPPING_TTL,
					);
					return null;
				}
				throw normalized;
			}
		})();

		this.inflight.set(provider, anilistId, options, promise);
		return promise;
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
		isValid: () => boolean,
	): Promise<
		| { handled: true; resolved: AcceptedAutoMappingResult | null }
		| { handled: false }
	> {
		const effectiveMapping = await this.getEffectiveMapping(
			provider,
			anilistId,
		);

		const clearAutoMappingIfCurrent = () =>
			isValid()
				? this.clearAutoMapping(provider, anilistId)
				: Promise.resolve();

		const recordAmbiguousIfCurrent = () =>
			isValid()
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
			if (this.manualMappings?.get(provider, anilistId) !== null) {
				try {
					await this.manualMappings?.clear(provider, anilistId);
				} catch (error) {
					logError(
						normalizeError(error),
						`MappingService:clearManualMapping:${provider}:${anilistId}`,
					);
				}
			}
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
			acceptedEvidence: {
				source,
				reason: resolved.reason,
				...(resolved.successfulSynonym
					? { successfulTitle: resolved.successfulSynonym }
					: {}),
			},
		};

		try {
			const changed = await this.autoMappingStore.set(
				provider,
				anilistId,
				mappedState,
				MAPPED_AUTO_MAPPING_TTL,
			);
			if (changed) {
				this.notifyMappingsChanged?.();
			}
		} catch (error) {
			this.log.error?.(
				`mapping:persist-resolved-failed provider=${provider} anilistId=${anilistId}`,
				normalizeError(error),
			);
			return null;
		}
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
		this.invalidateEntry(provider, anilistId);
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
		providerId: ProviderExternalId,
	): boolean {
		return (
			this.manualMappings?.getCandidateSuppression(
				provider,
				anilistId,
				providerId,
			) != null
		);
	}

	private getAnibridgeProviderIds(
		provider: Provider,
		anilistId: AniListId,
	): ProviderExternalId[] {
		return provider === "sonarr"
			? this.anibridgeMappingStore.getSonarrCandidates(anilistId)
			: this.anibridgeMappingStore.getRadarrCandidates(anilistId);
	}
}

export { type AnibridgeMappingPayload } from "./upstream-mapping";
export { type AcceptedAutoMappingResult } from "./auto-mapping/types";
