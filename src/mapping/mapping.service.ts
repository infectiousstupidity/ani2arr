/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/mapping/mapping.service.ts

import type { AniListMediaService } from '@/anilist';
import { getExtensionOptionsSnapshot, getProviderCredentials } from '@/options';
import type { Provider, ProviderCredentials } from '@/providers';
import {
  createError,
  ErrorCode,
  normalizeError,
} from '@/shared/errors';
import {
  clearExtensionMappingFailures,
  removeExtensionMappingFailure,
} from '@/mapping/cache/extension-mapping.cache';
import { logger } from '@/shared/utils/logger';
import { STORAGE_POLICIES } from '@/storage/policies';
import { MappingOverridesService } from './overrides';
import { type ProviderLookupClient, type ProviderLookupResult } from './lookup';
import { resolveProviderIdInternal } from './resolve-provider-id';
import { ResolverStateStore } from './resolver-state/resolver-state.store';
import { shouldApplyCandidateSuppression } from './resolution-policy';
import { UpstreamMappingStore } from './upstream';
import type {
  MappingAcceptedEvidence,
  MappingAcceptedSource,
  MappingResolvedSource,
  ResolveProviderIdOptions,
  ResolvedMapping,
  ResolverStateRecord,
} from './types';

type ProviderLookupRegistry = Record<
  Provider,
  ProviderLookupClient<ProviderCredentials, ProviderLookupResult>
>;

type AniListPrioritizeApi = {
  prioritize: (ids: number | number[], options?: { schedule?: boolean }) => void;
};

type AniListCacheEvictApi = {
  removeMediaFromCache: (id: number) => Promise<void>;
};

function canPrioritizeAniListMedia(api: AniListMediaService): api is AniListMediaService & AniListPrioritizeApi {
  return typeof (api as { prioritize?: unknown }).prioritize === 'function';
}

function canEvictAniListMedia(api: AniListMediaService): api is AniListMediaService & AniListCacheEvictApi {
  return typeof (api as { removeMediaFromCache?: unknown }).removeMediaFromCache === 'function';
}

export class MappingService {
  private readonly log = logger.create('MappingService');
  private readonly inflight = new Map<string, Promise<ResolvedMapping | null>>();
  private readonly sessionSeenCanonical: Record<Provider, Set<string>> = {
    sonarr: new Set<string>(),
    radarr: new Set<string>(),
  };

  constructor(
    private readonly anilistApi: AniListMediaService,
    private readonly upstreamMappingStore: UpstreamMappingStore,
    private readonly lookupClients: ProviderLookupRegistry,
    private readonly resolverStateStore: ResolverStateStore,
    private readonly overrides?: MappingOverridesService,
    private readonly notifyMappingsChanged?: () => void,
  ) {}

  public async resetLookupState(): Promise<void> {
    await Promise.all([
      this.lookupClients.sonarr.reset(),
      this.lookupClients.radarr.reset(),
      clearExtensionMappingFailures(),
      this.resolverStateStore.clear(),
    ]);
    this.inflight.clear();
    this.sessionSeenCanonical.sonarr.clear();
    this.sessionSeenCanonical.radarr.clear();
    this.notifyMappingsChanged?.();
  }

  public initStaticPairs(): Promise<void> {
    return this.upstreamMappingStore.init();
  }

  public prioritizeAniListMedia(anilistId: number, options?: { schedule?: boolean }): void {
    try {
      if (canPrioritizeAniListMedia(this.anilistApi)) {
        this.anilistApi.prioritize(anilistId, { schedule: options?.schedule === true });
      }
    } catch {
      // best-effort; ignore failures
    }
  }

  public async resolveProviderId(
    provider: Provider,
    anilistId: number,
    options: ResolveProviderIdOptions = {},
  ): Promise<ResolvedMapping | null> {
    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
      );
    }

    const bypassCachedResolutionState = options.ignoreFailureCache === true;
    const inflightKey = this.inflightKey(provider, anilistId);
    const existing = this.inflight.get(inflightKey);
    if (existing) {
      if (options.priority === 'high') {
        this.prioritizeAniListMedia(anilistId, { schedule: false });
      }
      return existing;
    }

    const promise = resolveProviderIdInternal(
      {
        anilistApi: this.anilistApi,
        upstreamMappingStore: this.upstreamMappingStore,
        lookupClients: this.lookupClients,
        resolverStateStore: this.resolverStateStore,
        log: this.log,
        sessionSeenCanonical: this.sessionSeenCanonical,
        ...(this.overrides ? { overrides: this.overrides } : {}),
        acceptResolved: (resolvedProvider, resolvedAniListId, resolved, source) => this.acceptResolved(
          resolvedProvider,
          resolvedAniListId,
          resolved,
          source,
        ),
        recordResolverState: (resolvedProvider, resolvedAniListId, state, ttl) => this.recordResolverState(
          resolvedProvider,
          resolvedAniListId,
          state,
          ttl,
        ),
        clearResolverState: (resolvedProvider, resolvedAniListId) => this.clearResolverState(
          resolvedProvider,
          resolvedAniListId,
        ),
        getConfiguredCredentials: resolvedProvider => this.getConfiguredCredentials(resolvedProvider),
        getUpstreamStaticProviderId: (resolvedProvider, resolvedAniListId) => this.getUpstreamStaticProviderId(
          resolvedProvider,
          resolvedAniListId,
        ),
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
      bypassCachedResolutionState,
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

    return promise;
  }

  private async acceptResolved(
    provider: Provider,
    anilistId: number,
    resolved: ResolvedMapping,
    source: MappingResolvedSource,
  ): Promise<ResolvedMapping | null> {
    const mappedState: Omit<Extract<ResolverStateRecord, { state: 'mapped' }>, 'updatedAt'> = {
      state: 'mapped',
      providerId: resolved.providerId,
      acceptedEvidence: this.buildAcceptedEvidence(source, resolved),
      ...(resolved.recentEvaluation ? { recentEvaluation: resolved.recentEvaluation } : {}),
    };

    try {
      await Promise.all([
        this.resolverStateStore.set(
          provider,
          anilistId,
          mappedState,
          STORAGE_POLICIES.extensionMapping,
        ),
        removeExtensionMappingFailure(provider, anilistId),
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

  private evictAniListMedia(anilistId: number): void {
    try {
      if (canEvictAniListMedia(this.anilistApi)) {
        void this.anilistApi.removeMediaFromCache(anilistId).catch(() => {});
      }
    } catch {
      // best-effort eviction; ignore failures
    }
  }

  private inflightKey(provider: Provider, anilistId: number): string {
    return `${provider}:${anilistId}`;
  }

  public async evictResolved(anilistId: number, provider: Provider = 'sonarr'): Promise<void> {
    await Promise.all([
      this.resolverStateStore.delete(provider, anilistId),
      removeExtensionMappingFailure(provider, anilistId),
    ]);
    this.inflight.delete(this.inflightKey(provider, anilistId));
    this.evictAniListMedia(anilistId);
    this.notifyMappingsChanged?.();
  }

  private async recordResolverState(
    provider: Provider,
    anilistId: number,
    state: Omit<ResolverStateRecord, 'updatedAt'>,
    ttl: { staleMs: number; hardMs: number },
  ): Promise<void> {
    const changed = await this.resolverStateStore.set(provider, anilistId, state, ttl);
    if (changed) {
      this.notifyMappingsChanged?.();
    }
  }

  private async clearResolverState(provider: Provider, anilistId: number): Promise<void> {
    if (await this.resolverStateStore.delete(provider, anilistId)) {
      this.notifyMappingsChanged?.();
    }
  }

  private isCandidateSuppressed(
    provider: Provider,
    anilistId: number,
    providerId: number,
  ): boolean {
    return this.overrides?.getCandidateSuppression(provider, anilistId, providerId) != null;
  }

  private isResolvedCandidateSuppressed(
    provider: Provider,
    anilistId: number,
    resolved: ResolvedMapping,
    source: MappingAcceptedSource,
  ): boolean {
    return (
      shouldApplyCandidateSuppression(source, resolved.reason) &&
      this.isCandidateSuppressed(provider, anilistId, resolved.providerId)
    );
  }

  private buildAcceptedEvidence(
    source: MappingAcceptedSource,
    resolved: ResolvedMapping,
  ): MappingAcceptedEvidence {
    return {
      source,
      reason: resolved.reason,
      ...(resolved.successfulSynonym ? { successfulTitle: resolved.successfulSynonym } : {}),
      ...(resolved.immediateSourceAniListId ? { immediateSourceAniListId: resolved.immediateSourceAniListId } : {}),
      ...(resolved.chainAnchorAniListId ? { chainAnchorAniListId: resolved.chainAnchorAniListId } : {}),
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

  private getUpstreamStaticProviderId(
    provider: Provider,
    anilistId: number,
  ): number | null {
    if (provider !== 'sonarr') {
      return null;
    }
    const hit = this.upstreamMappingStore.get(anilistId);
    if (!hit) {
      return null;
    }
    return hit.tvdbId;
  }
}

export { type UpstreamMappingPayload } from './upstream';
export { type ResolvedMapping } from './types';
