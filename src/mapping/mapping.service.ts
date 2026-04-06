/** Mapping service orchestration for AniList-to-provider resolution, caching, and persistence. */
// src/mapping/mapping.service.ts

import type { AniListMediaService } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import { getExtensionOptionsSnapshot, getProviderCredentials } from '@/options';
import type { Provider, ProviderCredentials } from '@/providers';
import {
  createError,
  ErrorCode,
  logError,
  normalizeError,
  type ExtensionError,
} from '@/shared/errors';
import {
  clearExtensionMappingFailures,
  readExtensionMappingFailure,
  removeExtensionMappingFailure,
  writeExtensionMappingFailure,
} from '@/mapping/cache/extension-mapping.cache';
import { incrementCounter } from '@/debug/metrics';
import { logger } from '@/shared/utils/logger';
import { getProviderLabel, resolveProviderForAniListFormat } from '@/providers/provider-routing';
import { STORAGE_POLICIES } from '@/storage/policies';
import type { RequestPriority } from '@/shared/utils/request-priority';
import {
  EARLY_STOP_THRESHOLD,
  FAILURE_HARD_TTL,
  FAILURE_SOFT_TTL,
  MAX_SEARCH_TERMS,
  NETWORK_FAILURE_HARD_TTL,
  NETWORK_FAILURE_SOFT_TTL,
  NO_MATCH_HARD_TTL,
  NO_MATCH_SOFT_TTL,
  SCORE_THRESHOLD,
} from './constants';
import { tryHintLookup } from './hints/hint-lookup';
import { buildMediaFromMetadataHint } from './hints/media-hints';
import { resolvePrequelStatic } from './hints/prequel-static';
import { MappingOverridesService } from './overrides';
import { type ProviderLookupClient, type ProviderLookupResult } from './lookup';
import { resolveViaPipeline } from './pipeline/pipeline';
import { ResolverStateStore } from './resolver-state/resolver-state.store';
import { UpstreamMappingStore } from './upstream';
import type {
  MappingAcceptedReason,
  MappingAcceptedEvidence,
  MappingAcceptedSource,
  MappingEvaluationCandidate,
  MappingEvaluationCandidateStatus,
  MappingRecentEvaluationTrace,
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

type ResolutionAttempt = {
  resolved: ResolvedMapping | null;
  recentEvaluation?: MappingRecentEvaluationTrace;
};

const RECENT_TRACE_CANDIDATE_LIMIT = 8;

const candidateStatusPriority: Record<MappingEvaluationCandidateStatus, number> = {
  accepted: 4,
  rejected: 3,
  suppressed: 2,
  'not-accepted': 1,
};

function describeAcceptanceReason(reason: MappingAcceptedReason): string {
  switch (reason) {
    case 'exact-upstream': {
      return 'Exact upstream mapping';
    }
    case 'manual-override': {
      return 'Manual override';
    }
    case 'exact-title-match': {
      return 'Exact title match';
    }
    case 'verified-inherited': {
      return 'Inherited from related AniList mapping';
    }
    case 'fuzzy-match': {
      return 'Fuzzy title match';
    }
    case 'borrowed-base-title-fallback': {
      return 'Borrowed base-title fallback';
    }
  }
}

function describeCandidate(reason: MappingAcceptedReason, status: MappingEvaluationCandidateStatus): string {
  const base = describeAcceptanceReason(reason);
  switch (status) {
    case 'accepted': {
      return base;
    }
    case 'rejected': {
      return `${base} rejected by candidate suppression`;
    }
    case 'suppressed': {
      return `${base} suppressed`;
    }
    case 'not-accepted': {
      return `${base} not accepted`;
    }
  }
}

function mergeTraceCandidates(
  candidates: readonly MappingEvaluationCandidate[],
): MappingEvaluationCandidate[] {
  const byProviderId = new Map<number, MappingEvaluationCandidate>();

  for (const candidate of candidates) {
    const existing = byProviderId.get(candidate.providerId);
    if (!existing) {
      byProviderId.set(candidate.providerId, candidate);
      continue;
    }

    const existingPriority = candidateStatusPriority[existing.status];
    const nextPriority = candidateStatusPriority[candidate.status];
    if (
      nextPriority > existingPriority ||
      (nextPriority === existingPriority && (candidate.score ?? 0) > (existing.score ?? 0))
    ) {
      byProviderId.set(candidate.providerId, candidate);
    }
  }

  return [...byProviderId.values()]
    .toSorted((left, right) => {
      const statusDiff = candidateStatusPriority[right.status] - candidateStatusPriority[left.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return (right.score ?? 0) - (left.score ?? 0);
    })
    .slice(0, RECENT_TRACE_CANDIDATE_LIMIT);
}

function mergeRecentEvaluations(
  ...traces: Array<MappingRecentEvaluationTrace | undefined>
): MappingRecentEvaluationTrace | undefined {
  const searchTerms: string[] = [];
  const searchTermSeen = new Set<string>();
  const candidates: MappingEvaluationCandidate[] = [];

  for (const trace of traces) {
    if (!trace) {
      continue;
    }
    for (const searchTerm of trace.searchTerms ?? []) {
      if (!searchTermSeen.has(searchTerm)) {
        searchTerms.push(searchTerm);
        searchTermSeen.add(searchTerm);
      }
    }
    candidates.push(...trace.candidates);
  }

  if (searchTerms.length === 0 && candidates.length === 0) {
    return undefined;
  }

  return {
    attemptedAt: Date.now(),
    ...(searchTerms.length > 0 ? { searchTerms } : {}),
    candidates: mergeTraceCandidates(candidates),
  };
}

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

    const bypassFailureCache = options.ignoreFailureCache === true;
    const inflightKey = this.inflightKey(provider, anilistId);
    const existing = this.inflight.get(inflightKey);
    if (existing) {
      if (options.priority === 'high') {
        this.prioritizeAniListMedia(anilistId, { schedule: false });
      }
      return existing;
    }

    const promise = this.resolveProviderIdInternal(provider, anilistId, options, bypassFailureCache);
    this.inflight.set(inflightKey, promise);

    promise.finally(() => {
      const current = this.inflight.get(inflightKey);
      if (current === promise) {
        this.inflight.delete(inflightKey);
      }
    });

    return promise;
  }

  public async resolveTvdbId(
    anilistId: number,
    options: ResolveProviderIdOptions = {},
  ): Promise<{ tvdbId: number; successfulSynonym?: string } | null> {
    const mapping = await this.resolveProviderId('sonarr', anilistId, options);
    if (!mapping) {
      return null;
    }
    return {
      tvdbId: mapping.providerId,
      ...(mapping.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
    };
  }

  private async resolveProviderIdInternal(
    provider: Provider,
    anilistId: number,
    options: ResolveProviderIdOptions,
    bypassFailureCache: boolean,
  ): Promise<ResolvedMapping | null> {
    if (this.overrides?.isIgnored(provider, anilistId)) {
      await this.clearResolverState(provider, anilistId);
      if (import.meta.env.DEV) {
        this.log.debug?.(`mapping:ignored provider=${provider} anilistId=${anilistId}`);
      }
      return null;
    }

    const overrideProviderId = this.overrides?.get(provider, anilistId) ?? null;
    if (overrideProviderId !== null) {
      await this.clearResolverState(provider, anilistId);
      const staticProviderId = this.getUpstreamStaticProviderId(provider, anilistId);
      if (staticProviderId !== null && staticProviderId === overrideProviderId) {
        try {
          await this.overrides?.clear(provider, anilistId);
        } catch (error) {
          logError(normalizeError(error), `MappingService:clearOverride:${provider}:${anilistId}`);
        }

        return this.acceptResolved(
          provider,
          anilistId,
          { providerId: staticProviderId, reason: 'exact-upstream' },
          'upstream',
        );
      }

      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:override-hit provider=${provider} anilistId=${anilistId} providerId=${overrideProviderId}`,
        );
      }
      return { providerId: overrideProviderId, reason: 'manual-override' };
    }

    const staticProviderId = this.getUpstreamStaticProviderId(provider, anilistId);
    if (staticProviderId !== null) {
      incrementCounter('mapping.lookup.static_hit');
      return this.acceptResolved(
        provider,
        anilistId,
        { providerId: staticProviderId, reason: 'exact-upstream' },
        'upstream',
      );
    }

    let resolverState = await this.resolverStateStore.get(provider, anilistId);
    if (resolverState?.state === 'mapped') {
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:resolver-state-hit provider=${provider} anilistId=${anilistId} providerId=${resolverState.providerId} source=${resolverState.acceptedEvidence.source} reason=${resolverState.acceptedEvidence.reason}`,
        );
      }
      if (
        this.isResolvedCandidateSuppressed(
          provider,
          anilistId,
          {
            providerId: resolverState.providerId,
            reason: resolverState.acceptedEvidence.reason,
            ...(resolverState.acceptedEvidence.successfulTitle
              ? { successfulSynonym: resolverState.acceptedEvidence.successfulTitle }
              : {}),
          },
          resolverState.acceptedEvidence.source,
        )
      ) {
        await this.clearResolverState(provider, anilistId);
        resolverState = null;
      } else {
        return {
          providerId: resolverState.providerId,
          reason: resolverState.acceptedEvidence.reason,
          ...(resolverState.acceptedEvidence.successfulTitle
            ? { successfulSynonym: resolverState.acceptedEvidence.successfulTitle }
            : {}),
        };
      }
    }

    if (!bypassFailureCache) {
      const cachedFailure = await readExtensionMappingFailure(provider, anilistId);
      if (cachedFailure) {
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `mapping:failure-cache-hit provider=${provider} anilistId=${anilistId} code=${cachedFailure.value.code}`,
          );
        }
        throw cachedFailure.value;
      }
      if (resolverState) {
        if (import.meta.env.DEV) {
          this.log.debug?.(
            `mapping:resolver-state-terminal provider=${provider} anilistId=${anilistId} state=${resolverState.state}`,
          );
        }
        return null;
      }
    }

    if (options.network === 'never') {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
        `Unable to resolve this title without contacting ${getProviderLabel(provider)}.`,
        { reason: 'network-disabled', provider },
      );
    }

    let seededRecentEvaluation: MappingRecentEvaluationTrace | undefined;
    const hintTerm = options.hints?.primaryTitle?.trim();
    if (hintTerm) {
      try {
        const credentials = await this.getConfiguredCredentials(provider);
        const hinted = await tryHintLookup(
          hintTerm,
          this.lookupClients[provider],
          credentials,
          this.log,
          options.forceLookupNetwork === true,
        );
        if (hinted) {
          if (!this.isResolvedCandidateSuppressed(provider, anilistId, hinted, 'auto')) {
            const recentEvaluation = this.createSingleCandidateTrace(
              hinted,
              'auto',
              'accepted',
              [hintTerm],
              hinted.successfulSynonym,
            );
            return this.acceptResolved(
              provider,
              anilistId,
              {
                ...hinted,
                ...(recentEvaluation ? { recentEvaluation } : {}),
              },
              'auto',
            );
          }
          seededRecentEvaluation = mergeRecentEvaluations(
            seededRecentEvaluation,
            this.createSingleCandidateTrace(
              hinted,
              'auto',
              'rejected',
              [hintTerm],
              hinted.successfulSynonym,
            ),
          );
          if (import.meta.env.DEV) {
            this.log.debug?.(
              `mapping:hint-suppressed provider=${provider} anilistId=${anilistId} providerId=${hinted.providerId} reason=${hinted.reason}`,
            );
          }
        }
      } catch (error) {
        logError(normalizeError(error), `MappingService:hintLookup:${provider}:${anilistId}`);
      }
    }

    return this.attemptNetworkResolution(
      provider,
      anilistId,
      options,
      bypassFailureCache,
      seededRecentEvaluation,
    );
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

  private async cacheFailure(
    provider: Provider,
    anilistId: number,
    error: ExtensionError,
  ): Promise<void> {
    const ttl = this.failureTtlsFor(error);
    await writeExtensionMappingFailure(provider, anilistId, error, {
      staleMs: ttl.stale,
      hardMs: ttl.hard,
    });
  }

  private async attemptNetworkResolution(
    provider: Provider,
    anilistId: number,
    options: ResolveProviderIdOptions,
    bypassFailureCache: boolean,
    seededRecentEvaluation?: MappingRecentEvaluationTrace,
  ): Promise<ResolvedMapping | null> {
    let attempt: ResolutionAttempt;
    try {
      if (import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:network-start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? 'normal'}`,
        );
      }
      attempt = await this.resolveViaNetwork(
        provider,
        anilistId,
        options.hints,
        options.priority,
        options.forceLookupNetwork === true,
      );
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === ErrorCode.VALIDATION_ERROR) {
        const fallbackTrace = this.createRecentEvaluationTrace(this.resolveUnresolvedSearchTerms(options.hints), []);
        const recentEvaluation = mergeRecentEvaluations(seededRecentEvaluation, fallbackTrace);
        await this.recordResolverState(
          provider,
          anilistId,
          {
            state: 'unresolved',
            ...(recentEvaluation
              ? { recentEvaluation }
              : {}),
          },
          {
            staleMs: NO_MATCH_SOFT_TTL,
            hardMs: NO_MATCH_HARD_TTL,
          },
        );
        await removeExtensionMappingFailure(provider, anilistId);
        return null;
      }

      if (!bypassFailureCache && this.shouldCacheFailure(normalized)) {
        await this.cacheFailure(provider, anilistId, normalized);
      }
      throw normalized;
    }

    const recentEvaluation = mergeRecentEvaluations(
      seededRecentEvaluation,
      attempt.recentEvaluation,
      this.createRecentEvaluationTrace(this.resolveUnresolvedSearchTerms(options.hints), []),
    );

    if (attempt.resolved === null) {
      await this.recordResolverState(
        provider,
        anilistId,
        {
          state: 'unresolved',
          ...(recentEvaluation
            ? { recentEvaluation }
            : {}),
        },
        {
          staleMs: NO_MATCH_SOFT_TTL,
          hardMs: NO_MATCH_HARD_TTL,
        },
      );
      await removeExtensionMappingFailure(provider, anilistId);
      return null;
    }

    if (import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:network-success provider=${provider} anilistId=${anilistId} providerId=${attempt.resolved.providerId}${attempt.resolved.successfulSynonym ? ` synonym="${attempt.resolved.successfulSynonym}"` : ''}`,
      );
    }
    return this.acceptResolved(
      provider,
      anilistId,
      {
        ...attempt.resolved,
        ...(recentEvaluation ? { recentEvaluation } : {}),
      },
      'auto',
    );
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

  private async resolveViaNetwork(
    provider: Provider,
    anilistId: number,
    hints: ResolveProviderIdOptions['hints'] | undefined,
    priority: RequestPriority | undefined,
    forceLookupNetwork: boolean,
  ): Promise<ResolutionAttempt> {
    const credentials = await this.getConfiguredCredentials(provider);
    let recentEvaluation: MappingRecentEvaluationTrace | undefined;

    const metadataMedia = buildMediaFromMetadataHint(anilistId, hints?.domMedia);
    if (metadataMedia) {
      const metadataAttempt = await this.tryResolveWithMedia(
        provider,
        metadataMedia,
        credentials,
        hints,
        priority,
        forceLookupNetwork,
      );
      if (metadataAttempt.resolved) {
        if (!this.isResolvedCandidateSuppressed(provider, anilistId, metadataAttempt.resolved, 'auto')) {
          const mergedRecentEvaluation = mergeRecentEvaluations(recentEvaluation, metadataAttempt.recentEvaluation);
          return {
            resolved: metadataAttempt.resolved,
            ...(mergedRecentEvaluation ? { recentEvaluation: mergedRecentEvaluation } : {}),
          };
        }
        recentEvaluation = mergeRecentEvaluations(
          recentEvaluation,
          this.rewriteTraceCandidateStatus(
            metadataAttempt.recentEvaluation,
            metadataAttempt.resolved.providerId,
            'rejected',
          ),
        );
      }
      if (metadataAttempt.resolved && import.meta.env.DEV) {
        this.log.debug?.(
          `mapping:metadata-candidate-suppressed provider=${provider} anilistId=${anilistId} providerId=${metadataAttempt.resolved.providerId} reason=${metadataAttempt.resolved.reason}`,
        );
      } else {
        recentEvaluation = mergeRecentEvaluations(recentEvaluation, metadataAttempt.recentEvaluation);
      }
    }

    const apiMedia = await this.anilistApi.fetchMediaWithRelations(
      anilistId,
      priority === undefined
        ? { source: 'mapping-resolve' }
        : { priority, source: 'mapping-resolve' },
    );
    const apiAttempt = await this.tryResolveWithMedia(
      provider,
      apiMedia,
      credentials,
      hints,
      priority,
      forceLookupNetwork,
    );
    if (apiAttempt.resolved) {
      if (!this.isResolvedCandidateSuppressed(provider, anilistId, apiAttempt.resolved, 'auto')) {
        const mergedRecentEvaluation = mergeRecentEvaluations(recentEvaluation, apiAttempt.recentEvaluation);
        return {
          resolved: apiAttempt.resolved,
          ...(mergedRecentEvaluation ? { recentEvaluation: mergedRecentEvaluation } : {}),
        };
      }
      recentEvaluation = mergeRecentEvaluations(
        recentEvaluation,
        this.rewriteTraceCandidateStatus(
          apiAttempt.recentEvaluation,
          apiAttempt.resolved.providerId,
          'rejected',
        ),
      );
    }
    if (apiAttempt.resolved && import.meta.env.DEV) {
      this.log.debug?.(
        `mapping:api-candidate-suppressed provider=${provider} anilistId=${anilistId} providerId=${apiAttempt.resolved.providerId} reason=${apiAttempt.resolved.reason}`,
      );
    } else {
      recentEvaluation = mergeRecentEvaluations(recentEvaluation, apiAttempt.recentEvaluation);
    }

    this.log.debug(`resolveViaNetwork: provider=${provider} no match found for AniList ID ${anilistId}`);
    return { resolved: null, ...(recentEvaluation ? { recentEvaluation } : {}) };
  }

  private async tryResolveWithMedia(
    provider: Provider,
    media: AniListMedia,
    credentials: ProviderCredentials,
    hints: ResolveProviderIdOptions['hints'] | undefined,
    priority: RequestPriority | undefined,
    forceLookupNetwork: boolean,
  ): Promise<ResolutionAttempt> {
    const routedProvider = resolveProviderForAniListFormat(media.format);
    if (routedProvider !== provider) {
      this.log.debug(
        `tryResolveWithMedia: provider mismatch for AniList ID ${media.id} format='${String(media.format)}' expected=${provider} actual=${String(routedProvider)}`,
      );
      return { resolved: null };
    }

    if (provider === 'sonarr') {
      const prequelStatic = await resolvePrequelStatic(media, this.upstreamMappingStore, this.anilistApi);
      if (prequelStatic) {
        const recentEvaluation = this.createSingleCandidateTrace(prequelStatic, 'auto', 'accepted');
        return {
          resolved: prequelStatic,
          ...(recentEvaluation ? { recentEvaluation } : {}),
        };
      }
    }

    const lookupClient = this.lookupClients[provider];
    const outcome = await resolveViaPipeline(
      media,
      {
        anilistApi: this.anilistApi,
        lookupClient,
        upstreamMappingStore: this.upstreamMappingStore,
        credentials,
        ...(priority === undefined ? {} : { priority }),
        ...(forceLookupNetwork ? { forceLookupNetwork: true } : {}),
        sessionSeenCanonical: this.sessionSeenCanonical[provider],
        limits: {
          maxTerms: MAX_SEARCH_TERMS,
          scoreThreshold: SCORE_THRESHOLD,
          earlyStopThreshold: EARLY_STOP_THRESHOLD,
        },
        log: this.log,
      },
      hints?.primaryTitle,
    );

    if (outcome.status === 'resolved') {
      const recentEvaluation = this.createPipelineRecentEvaluation(outcome);
      return {
        resolved: {
          providerId: outcome.providerId,
          reason: outcome.reason,
          ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
        },
        ...(recentEvaluation ? { recentEvaluation } : {}),
      };
    }
    const recentEvaluation = this.createPipelineRecentEvaluation(outcome);
    return {
      resolved: null,
      ...(recentEvaluation ? { recentEvaluation } : {}),
    };
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
      this.shouldApplyCandidateSuppression(source, resolved.reason) &&
      this.isCandidateSuppressed(provider, anilistId, resolved.providerId)
    );
  }

  private shouldApplyCandidateSuppression(
    _source: MappingAcceptedSource,
    reason: MappingAcceptedReason,
  ): boolean {
    // Exact manual and exact upstream mappings are authoritative and must bypass candidate suppression.
    return reason !== 'manual-override' && reason !== 'exact-upstream';
  }

  private resolveUnresolvedSearchTerms(hints?: ResolveProviderIdOptions['hints']): string[] {
    const directTitle = hints?.primaryTitle?.trim();
    if (directTitle) {
      return [directTitle];
    }
    const titles = hints?.domMedia?.titles;
    const metadataTitle = [titles?.english, titles?.romaji, titles?.native]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim();
    return metadataTitle ? [metadataTitle] : [];
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

  private createRecentEvaluationTrace(
    searchTerms: readonly string[],
    candidates: readonly MappingEvaluationCandidate[],
  ): MappingRecentEvaluationTrace | undefined {
    if (searchTerms.length === 0 && candidates.length === 0) {
      return undefined;
    }

    return {
      attemptedAt: Date.now(),
      ...(searchTerms.length > 0 ? { searchTerms: [...searchTerms] } : {}),
      candidates: mergeTraceCandidates(candidates),
    };
  }

  private createSingleCandidateTrace(
    resolved: ResolvedMapping,
    source: MappingAcceptedSource,
    status: MappingEvaluationCandidateStatus,
    searchTerms: readonly string[] = [],
    title?: string,
  ): MappingRecentEvaluationTrace | undefined {
    return this.createRecentEvaluationTrace(searchTerms, [
      {
        providerId: resolved.providerId,
        ...(title ? { title } : {}),
        source,
        reason: resolved.reason,
        status,
        summary: describeCandidate(resolved.reason, status),
      },
    ]);
  }

  private rewriteTraceCandidateStatus(
    trace: MappingRecentEvaluationTrace | undefined,
    providerId: number,
    status: MappingEvaluationCandidateStatus,
  ): MappingRecentEvaluationTrace | undefined {
    if (!trace) {
      return undefined;
    }

    const candidates = trace.candidates.map((candidate) => (
      candidate.providerId === providerId
        ? {
            ...candidate,
            status,
            summary: describeCandidate(candidate.reason, status),
          }
        : candidate
    ));

    return this.createRecentEvaluationTrace(trace.searchTerms ?? [], candidates);
  }

  private createPipelineRecentEvaluation(
    outcome: Awaited<ReturnType<typeof resolveViaPipeline>>,
  ): MappingRecentEvaluationTrace | undefined {
    return this.createRecentEvaluationTrace(
      outcome.searchTerms,
      outcome.candidates.map((candidate) => {
        const status: MappingEvaluationCandidateStatus =
          outcome.status === 'resolved' && candidate.providerId === outcome.providerId
            ? 'accepted'
            : 'not-accepted';

        return {
          providerId: candidate.providerId,
          title: candidate.title,
          source: 'auto',
          reason: candidate.reason,
          status,
          summary: describeCandidate(candidate.reason, status),
          score: candidate.score,
        };
      }),
    );
  }

  private shouldCacheFailure(error: ExtensionError): boolean {
    return (
      error.code === ErrorCode.CONFIGURATION_ERROR ||
      error.code === ErrorCode.NETWORK_ERROR ||
      error.code === ErrorCode.API_ERROR ||
      error.code === ErrorCode.PERMISSION_ERROR ||
      error.code === ErrorCode.SONARR_NOT_CONFIGURED
    );
  }

  private failureTtlsFor(error: ExtensionError): { stale: number; hard: number } {
    if (error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.API_ERROR) {
      return { stale: NETWORK_FAILURE_SOFT_TTL, hard: NETWORK_FAILURE_HARD_TTL };
    }
    return { stale: FAILURE_SOFT_TTL, hard: FAILURE_HARD_TTL };
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



export {type UpstreamMappingPayload} from './upstream';
export {type ResolvedMapping} from './types';
