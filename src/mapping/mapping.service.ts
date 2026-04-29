/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/mapping/mapping.service.ts

import type { AniListId, AniListMediaService  } from '@/anilist';
import { incrementCounter } from '@/debug/metrics';
import { getExtensionOptionsSnapshot, getProviderCredentials } from '@/options';
import { parseProviderIdentity, type Provider, type ProviderCredentials, type ProviderIdFor, type ProviderTargetId, type TmdbId, type TvdbId } from '@/providers';
import {
  createError,
  ErrorCode,
  logError,
  normalizeError,
} from '@/shared/errors';
import {
  clearAutoMappingFailures,
  removeAutoMappingFailure,
} from './auto-mapping/failure.cache';
import { logger } from '@/shared/utils/logger';
import { ManualMappingService } from './manual';
import { type ProviderLookupClient, type ProviderLookupResult } from './lookup';
import { resolveAutoMapping } from './auto-mapping/resolve-auto-mapping';
import {
  MAPPED_AUTO_MAPPING_TTL,
  UNRESOLVED_AUTO_MAPPING_TTL,
  AutoMappingStore,
} from './auto-mapping/auto-mapping.store';
import { shouldApplyCandidateSuppression } from './resolution-policy';
import { AnibridgeMappingStore } from './upstream';
import { buildEffectiveMapping } from './effective-mapping';
import type {
  AcceptedMappingEvidence,
  AcceptedMappingSource,
} from "./types";
import type {
  AutoMappingSource,
  AutoMappingOptions,
  AcceptedAutoMappingResult,
  AutoMappingRecord,
} from './auto-mapping/types';

type ProviderLookupRegistry = Record<
  Provider,
  ProviderLookupClient<ProviderCredentials, ProviderLookupResult>
>;

type AniListPrioritizeApi = {
  prioritize: (ids: AniListId | AniListId[], options?: { schedule?: boolean }) => void;
};

type AniListCacheEvictApi = {
  removeMediaFromCache: (id: AniListId) => Promise<void>;
};

function canPrioritizeAniListMedia(api: AniListMediaService): api is AniListMediaService & AniListPrioritizeApi {
  return typeof (api as { prioritize?: unknown }).prioritize === 'function';
}

function canEvictAniListMedia(api: AniListMediaService): api is AniListMediaService & AniListCacheEvictApi {
  return typeof (api as { removeMediaFromCache?: unknown }).removeMediaFromCache === 'function';
}

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<string, Promise<AcceptedAutoMappingResult | null>>();
  private readonly sessionSeenCanonical: Record<Provider, Set<string>> = {
    sonarr: new Set<string>(),
    radarr: new Set<string>(),
  };

  constructor(
    private readonly anilistApi: AniListMediaService,
    private readonly anibridgeMappingStore: AnibridgeMappingStore,
    private readonly lookupClients: ProviderLookupRegistry,
    private readonly autoMappingStore: AutoMappingStore,
    private readonly manualMappings?: ManualMappingService,
    private readonly notifyMappingsChanged?: () => void,
  ) {}

  public async resetLookupState(provider?: Provider): Promise<void> {
    if (!provider) {
      await Promise.all([
        this.lookupClients.sonarr.reset(),
        this.lookupClients.radarr.reset(),
        clearAutoMappingFailures(),
        this.autoMappingStore.clear(),
      ]);
      this.inflight.clear();
      this.sessionSeenCanonical.sonarr.clear();
      this.sessionSeenCanonical.radarr.clear();
      this.notifyMappingsChanged?.();
      return;
    }

    await Promise.all([
      this.lookupClients[provider].reset(),
      clearAutoMappingFailures(provider),
      this.autoMappingStore.clear(provider),
    ]);

    for (const key of this.inflight.keys()) {
      if (key.startsWith(`${provider}:`)) {
        this.inflight.delete(key);
      }
    }

    this.sessionSeenCanonical[provider].clear();
    this.notifyMappingsChanged?.();
  }

  public initAnibridgeMappings(): Promise<void> {
    return this.anibridgeMappingStore.init();
  }

  public prioritizeAniListMedia(anilistId: AniListId, options?: { schedule?: boolean }): void {
    try {
      if (canPrioritizeAniListMedia(this.anilistApi)) {
        this.anilistApi.prioritize(anilistId, { schedule: options?.schedule === true });
      }
    } catch {
      // best-effort; ignore failures
    }
  }

  public async resolveProviderId<P extends Provider>(
    provider: P,
    anilistId: AniListId,
    options: AutoMappingOptions = {},
  ): Promise<(AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null> {
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
      );
    }

    const precedenceResult = await this.resolveAuthoritativeMapping(provider, anilistId);
    if (precedenceResult.handled) {
      return precedenceResult.resolved as (AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null;
    }

    const inflightKey = this.inflightKey(provider, anilistId);
    const existing = this.inflight.get(inflightKey);
    if (existing) {
      if (options.priority === 'high') {
        this.prioritizeAniListMedia(anilistId, { schedule: false });
      }
      return existing as Promise<(AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null>;
    }

    const promise = resolveAutoMapping(
      {
        anilistApi: this.anilistApi,
        anibridgeMappingStore: this.anibridgeMappingStore,
        lookupClients: this.lookupClients,
        autoMappingStore: this.autoMappingStore,
        log: this.log,
        sessionSeenCanonical: this.sessionSeenCanonical,
        ...(this.manualMappings ? { manualMappings: this.manualMappings } : {}),
        acceptResolved: (resolvedProvider, resolvedAniListId, resolved, source) => this.acceptResolved(
          resolvedProvider,
          resolvedAniListId,
          resolved,
          source,
        ),
        recordAutoMapping: (resolvedProvider, resolvedAniListId, state, ttl) => this.recordAutoMapping(
          resolvedProvider,
          resolvedAniListId,
          state,
          ttl,
        ),
        clearAutoMapping: (resolvedProvider, resolvedAniListId) => this.clearAutoMapping(
          resolvedProvider,
          resolvedAniListId,
        ),
        getConfiguredCredentials: resolvedProvider => this.getConfiguredCredentials(resolvedProvider),
        isResolvedCandidateSuppressed: (resolvedProvider, resolvedAniListId, resolved, source) => this.isResolvedCandidateSuppressed(
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
    this.inflight.set(inflightKey, promise);

    promise
      .finally(() => {
        const current = this.inflight.get(inflightKey);
        if (current === promise) {
          this.inflight.delete(inflightKey);
        }
      })
      .catch(() => {});

    return promise as Promise<(AcceptedAutoMappingResult & { providerId: ProviderIdFor<P> }) | null>;
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
  ): Promise<{ handled: true; resolved: AcceptedAutoMappingResult | null } | { handled: false }> {
    const manualProviderId = this.manualMappings?.get(provider, anilistId) ?? null;
    const upstreamProviderIds = this.getAnibridgeProviderIds(provider, anilistId);
    const effectiveMapping = buildEffectiveMapping({
      provider,
      anilistId,
      manualProviderId,
      ignored: this.manualMappings?.isIgnored(provider, anilistId) ?? false,
      upstreamProviderIds,
      autoMappingRecord: null,
    });

    if (effectiveMapping.mappingEntryKind === 'ignored') {
      await this.clearAutoMapping(provider, anilistId);
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:ignored provider=${provider} anilistId=${anilistId}`);
      }
      return { handled: true, resolved: null };
    }

    if (effectiveMapping.mappingEntryKind === 'manual' && effectiveMapping.providerId !== null) {
      await this.clearAutoMapping(provider, anilistId);
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:manual-mapping-hit provider=${provider} anilistId=${anilistId} providerId=${effectiveMapping.providerId}`,
        );
      }
      return {
        handled: true,
        resolved: { providerId: effectiveMapping.providerId, reason: 'manual-override' },
      };
    }

    if (effectiveMapping.mappingEntryKind === 'upstream' && effectiveMapping.providerId !== null) {
      if (manualProviderId !== null) {
        try {
          await this.manualMappings?.clear(provider, anilistId);
        } catch (error) {
          logError(normalizeError(error), `MappingService:clearManualMapping:${provider}:${anilistId}`);
        }
      }

      incrementCounter('mapping.lookup.static_hit');
      const resolved = await this.acceptResolved(
        provider,
        anilistId,
        { providerId: effectiveMapping.providerId, reason: 'exact-upstream' },
        'upstream',
      );
      return { handled: true, resolved };
    }

    if (
      effectiveMapping.providerMappingState === 'unknown' &&
      effectiveMapping.mappingUnknownReason === 'ambiguous'
    ) {
      await this.recordAutoMapping(
        provider,
        anilistId,
        { state: 'ambiguous' },
        UNRESOLVED_AUTO_MAPPING_TTL,
      );
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
    const mappedState: Omit<Extract<AutoMappingRecord, { state: 'mapped' }>, 'updatedAt'> = {
      state: 'mapped',
      providerId: resolved.providerId,
      acceptedEvidence: this.buildAcceptedEvidence(source, resolved),
      ...(resolved.recentEvaluation ? { recentEvaluation: resolved.recentEvaluation } : {}),
    };

    try {
      await Promise.all([
        this.autoMappingStore.set(
          provider,
          anilistId,
          mappedState,
          MAPPED_AUTO_MAPPING_TTL,
        ),
        removeAutoMappingFailure(provider, anilistId),
      ]);
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

  private inflightKey(provider: Provider, anilistId: AniListId): string {
    return `${provider}:${anilistId}`;
  }

  public async evictResolved(anilistId: AniListId, provider: Provider = 'sonarr'): Promise<void> {
    await Promise.all([
      this.autoMappingStore.delete(provider, anilistId),
      removeAutoMappingFailure(provider, anilistId),
    ]);
    this.inflight.delete(this.inflightKey(provider, anilistId));
    this.evictAniListMedia(anilistId);
    this.notifyMappingsChanged?.();
  }

  private async recordAutoMapping(
    provider: Provider,
    anilistId: AniListId,
    state: Omit<AutoMappingRecord, 'updatedAt'>,
    ttl: { hardMs: number },
  ): Promise<void> {
    const changed = await this.autoMappingStore.set(provider, anilistId, state, ttl);
    if (changed) {
      this.notifyMappingsChanged?.();
    }
  }

  private async clearAutoMapping(provider: Provider, anilistId: AniListId): Promise<void> {
    if (await this.autoMappingStore.delete(provider, anilistId)) {
      this.notifyMappingsChanged?.();
    }
  }

  private isCandidateSuppressed(
    provider: Provider,
    anilistId: AniListId,
    providerId: ProviderTargetId,
  ): boolean {
    const identity = parseProviderIdentity(provider, providerId);
    return this.manualMappings?.getCandidateSuppression(
      identity.provider,
      anilistId,
      identity.providerId,
    ) != null;
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

  private buildAcceptedEvidence(
    source: AcceptedMappingSource,
    resolved: AcceptedAutoMappingResult,
  ): AcceptedMappingEvidence {
    return {
      source,
      reason: resolved.reason,
      ...(resolved.successfulSynonym ? { successfulTitle: resolved.successfulSynonym } : {}),
      ...(resolved.immediateSourceAniListId ? { immediateSourceAniListId: resolved.immediateSourceAniListId } : {}),
      ...(resolved.chainAnchorAniListId ? { chainAnchorAniListId: resolved.chainAnchorAniListId } : {}),
      ...(resolved.inheritedVerification ? { inheritedVerification: resolved.inheritedVerification } : {}),
    };
  }

  private async getConfiguredCredentials(provider: Provider): Promise<ProviderCredentials> {
    const options = await getExtensionOptionsSnapshot();
    const credentials = getProviderCredentials(options, provider);
    if (!credentials) {
      if (provider === 'sonarr') {
        throw createError(
          ErrorCode.SONARR_NOT_CONFIGURED,
          'Sonarr credentials are not configured.',
          'Configure your Sonarr connection in ani2arr options.',
        );
      }
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        'Radarr credentials are not configured.',
        'Configure your Radarr connection in ani2arr options.',
      );
    }
    return credentials;
  }

  private getUniqueAnibridgeProviderId(provider: Provider, anilistId: AniListId): ProviderTargetId | null {
    const providerIds = this.getAnibridgeProviderIds(provider, anilistId);
    return providerIds.length === 1 ? providerIds[0]! : null;
  }

  private getAnibridgeProviderIds(provider: 'sonarr', anilistId: AniListId): TvdbId[];
  private getAnibridgeProviderIds(provider: 'radarr', anilistId: AniListId): TmdbId[];
  private getAnibridgeProviderIds(provider: Provider, anilistId: AniListId): ProviderTargetId[];
  private getAnibridgeProviderIds(
    provider: Provider,
    anilistId: AniListId,
  ): ProviderTargetId[] {
    return provider === 'sonarr'
      ? this.anibridgeMappingStore.getSonarrCandidates(anilistId)
      : this.anibridgeMappingStore.getRadarrCandidates(anilistId);
  }
}

export { type AnibridgeMappingPayload } from './upstream';
export { type AcceptedAutoMappingResult } from './auto-mapping/types';
