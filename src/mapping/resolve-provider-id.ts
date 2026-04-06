/** Internal provider-id resolution workflow extracted from MappingService. */
// src/mapping/resolve-provider-id.ts

import type { AniListMediaService } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import { incrementCounter } from '@/debug/metrics';
import {
  readExtensionMappingFailure,
  removeExtensionMappingFailure,
  writeExtensionMappingFailure,
} from '@/mapping/cache/extension-mapping.cache';
import type { Provider, ProviderCredentials } from '@/providers';
import { getProviderLabel, resolveProviderForAniListFormat } from '@/providers/provider-routing';
import {
  createError,
  ErrorCode,
  logError,
  normalizeError,
  type ExtensionError,
} from '@/shared/errors';
import type { RequestPriority } from '@/shared/utils/request-priority';
import type { ScopedLogger } from '@/shared/utils/logger';
import {
  EARLY_STOP_THRESHOLD,
  MAX_SEARCH_TERMS,
  NO_MATCH_HARD_TTL,
  NO_MATCH_SOFT_TTL,
  SCORE_THRESHOLD,
} from './constants';
import { tryHintLookup } from './hints/hint-lookup';
import { buildMediaFromMetadataHint } from './hints/media-hints';
import { resolvePrequelStatic } from './hints/prequel-static';
import type { ProviderLookupClient, ProviderLookupResult } from './lookup';
import type { MappingOverridesService } from './overrides';
import { resolveViaPipeline } from './pipeline/pipeline';
import {
  createPipelineRecentEvaluation,
  createRecentEvaluationTrace,
  createSingleCandidateTrace,
  mergeRecentEvaluations,
  rewriteTraceCandidateStatus,
} from './recent-evaluation';
import type { ResolverStateStore } from './resolver-state/resolver-state.store';
import {
  failureTtlsFor,
  resolveUnresolvedSearchTerms,
  shouldCacheFailure,
} from './resolution-policy';
import type { UpstreamMappingStore } from './upstream';
import type {
  MappingAcceptedSource,
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

type ResolutionAttempt = {
  resolved: ResolvedMapping | null;
  recentEvaluation?: MappingRecentEvaluationTrace;
};

type MappingOverrideReads = Pick<MappingOverridesService, 'isIgnored' | 'get' | 'clear'>;

type ResolveProviderIdDeps = {
  anilistApi: AniListMediaService;
  upstreamMappingStore: UpstreamMappingStore;
  lookupClients: ProviderLookupRegistry;
  resolverStateStore: Pick<ResolverStateStore, 'get'>;
  log: ScopedLogger;
  sessionSeenCanonical: Record<Provider, Set<string>>;
  overrides?: MappingOverrideReads;
  acceptResolved: (
    provider: Provider,
    anilistId: number,
    resolved: ResolvedMapping,
    source: MappingResolvedSource,
  ) => Promise<ResolvedMapping | null>;
  recordResolverState: (
    provider: Provider,
    anilistId: number,
    state: Omit<ResolverStateRecord, 'updatedAt'>,
    ttl: { staleMs: number; hardMs: number },
  ) => Promise<void>;
  clearResolverState: (provider: Provider, anilistId: number) => Promise<void>;
  getConfiguredCredentials: (provider: Provider) => Promise<ProviderCredentials>;
  getUpstreamStaticProviderId: (provider: Provider, anilistId: number) => number | null;
  isResolvedCandidateSuppressed: (
    provider: Provider,
    anilistId: number,
    resolved: ResolvedMapping,
    source: MappingAcceptedSource,
  ) => boolean;
};

export async function resolveProviderIdInternal(
  deps: ResolveProviderIdDeps,
  provider: Provider,
  anilistId: number,
  options: ResolveProviderIdOptions,
  bypassFailureCache: boolean,
): Promise<ResolvedMapping | null> {
  if (deps.overrides?.isIgnored(provider, anilistId)) {
    await deps.clearResolverState(provider, anilistId);
    if (import.meta.env.DEV) {
      deps.log.debug?.(`mapping:ignored provider=${provider} anilistId=${anilistId}`);
    }
    return null;
  }

  const overrideProviderId = deps.overrides?.get(provider, anilistId) ?? null;
  if (overrideProviderId !== null) {
    await deps.clearResolverState(provider, anilistId);
    const staticProviderId = deps.getUpstreamStaticProviderId(provider, anilistId);
    if (staticProviderId !== null && staticProviderId === overrideProviderId) {
      try {
        await deps.overrides?.clear(provider, anilistId);
      } catch (error) {
        logError(normalizeError(error), `MappingService:clearOverride:${provider}:${anilistId}`);
      }

      return deps.acceptResolved(
        provider,
        anilistId,
        { providerId: staticProviderId, reason: 'exact-upstream' },
        'upstream',
      );
    }

    if (import.meta.env.DEV) {
      deps.log.debug?.(
        `mapping:override-hit provider=${provider} anilistId=${anilistId} providerId=${overrideProviderId}`,
      );
    }
    return { providerId: overrideProviderId, reason: 'manual-override' };
  }

  const staticProviderId = deps.getUpstreamStaticProviderId(provider, anilistId);
  if (staticProviderId !== null) {
    incrementCounter('mapping.lookup.static_hit');
    return deps.acceptResolved(
      provider,
      anilistId,
      { providerId: staticProviderId, reason: 'exact-upstream' },
      'upstream',
    );
  }

  let resolverState = await deps.resolverStateStore.get(provider, anilistId);
  if (resolverState?.state === 'mapped') {
    if (import.meta.env.DEV) {
      deps.log.debug?.(
        `mapping:resolver-state-hit provider=${provider} anilistId=${anilistId} providerId=${resolverState.providerId} source=${resolverState.acceptedEvidence.source} reason=${resolverState.acceptedEvidence.reason}`,
      );
    }
    if (
      deps.isResolvedCandidateSuppressed(
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
      await deps.clearResolverState(provider, anilistId);
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
        deps.log.debug?.(
          `mapping:failure-cache-hit provider=${provider} anilistId=${anilistId} code=${cachedFailure.value.code}`,
        );
      }
      throw cachedFailure.value;
    }
    if (resolverState) {
      if (import.meta.env.DEV) {
        deps.log.debug?.(
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
      const credentials = await deps.getConfiguredCredentials(provider);
      const hinted = await tryHintLookup(
        hintTerm,
        deps.lookupClients[provider],
        credentials,
        deps.log,
        options.forceLookupNetwork === true,
      );
      if (hinted) {
        if (!deps.isResolvedCandidateSuppressed(provider, anilistId, hinted, 'auto')) {
          const recentEvaluation = createSingleCandidateTrace(
            hinted,
            'auto',
            'accepted',
            [hintTerm],
            hinted.successfulSynonym,
          );
          return deps.acceptResolved(
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
          createSingleCandidateTrace(
            hinted,
            'auto',
            'rejected',
            [hintTerm],
            hinted.successfulSynonym,
          ),
        );
        if (import.meta.env.DEV) {
          deps.log.debug?.(
            `mapping:hint-suppressed provider=${provider} anilistId=${anilistId} providerId=${hinted.providerId} reason=${hinted.reason}`,
          );
        }
      }
    } catch (error) {
      logError(normalizeError(error), `MappingService:hintLookup:${provider}:${anilistId}`);
    }
  }

  return attemptNetworkResolution(
    deps,
    provider,
    anilistId,
    options,
    bypassFailureCache,
    seededRecentEvaluation,
  );
}

async function attemptNetworkResolution(
  deps: ResolveProviderIdDeps,
  provider: Provider,
  anilistId: number,
  options: ResolveProviderIdOptions,
  bypassFailureCache: boolean,
  seededRecentEvaluation?: MappingRecentEvaluationTrace,
): Promise<ResolvedMapping | null> {
  let attempt: ResolutionAttempt;
  try {
    if (import.meta.env.DEV) {
      deps.log.debug?.(
        `mapping:network-start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? 'normal'}`,
      );
    }
    attempt = await resolveViaNetwork(
      deps,
      provider,
      anilistId,
      options.hints,
      options.priority,
      options.forceLookupNetwork === true,
    );
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === ErrorCode.VALIDATION_ERROR) {
      const fallbackTrace = createRecentEvaluationTrace(resolveUnresolvedSearchTerms(options.hints), []);
      const recentEvaluation = mergeRecentEvaluations(seededRecentEvaluation, fallbackTrace);
      await deps.recordResolverState(
        provider,
        anilistId,
        {
          state: 'unresolved',
          ...(recentEvaluation ? { recentEvaluation } : {}),
        },
        {
          staleMs: NO_MATCH_SOFT_TTL,
          hardMs: NO_MATCH_HARD_TTL,
        },
      );
      await removeExtensionMappingFailure(provider, anilistId);
      return null;
    }

    if (!bypassFailureCache && shouldCacheFailure(normalized)) {
      await cacheFailure(provider, anilistId, normalized);
    }
    throw normalized;
  }

  const recentEvaluation = mergeRecentEvaluations(
    seededRecentEvaluation,
    attempt.recentEvaluation,
    createRecentEvaluationTrace(resolveUnresolvedSearchTerms(options.hints), []),
  );

  if (attempt.resolved === null) {
    await deps.recordResolverState(
      provider,
      anilistId,
      {
        state: 'unresolved',
        ...(recentEvaluation ? { recentEvaluation } : {}),
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
    deps.log.debug?.(
      `mapping:network-success provider=${provider} anilistId=${anilistId} providerId=${attempt.resolved.providerId}${attempt.resolved.successfulSynonym ? ` synonym="${attempt.resolved.successfulSynonym}"` : ''}`,
    );
  }
  return deps.acceptResolved(
    provider,
    anilistId,
    {
      ...attempt.resolved,
      ...(recentEvaluation ? { recentEvaluation } : {}),
    },
    'auto',
  );
}

async function cacheFailure(
  provider: Provider,
  anilistId: number,
  error: ExtensionError,
): Promise<void> {
  const ttl = failureTtlsFor(error);
  await writeExtensionMappingFailure(provider, anilistId, error, {
    staleMs: ttl.stale,
    hardMs: ttl.hard,
  });
}

async function resolveViaNetwork(
  deps: ResolveProviderIdDeps,
  provider: Provider,
  anilistId: number,
  hints: ResolveProviderIdOptions['hints'] | undefined,
  priority: RequestPriority | undefined,
  forceLookupNetwork: boolean,
): Promise<ResolutionAttempt> {
  const credentials = await deps.getConfiguredCredentials(provider);
  let recentEvaluation: MappingRecentEvaluationTrace | undefined;

  const applyAttempt = (
    label: 'metadata' | 'api',
    attempt: ResolutionAttempt,
  ): ResolutionAttempt | null => {
    const resolved = attempt.resolved;

    if (resolved === null) {
      recentEvaluation = mergeRecentEvaluations(recentEvaluation, attempt.recentEvaluation);
      return null;
    }

    if (!deps.isResolvedCandidateSuppressed(provider, anilistId, resolved, 'auto')) {
      const mergedRecentEvaluation = mergeRecentEvaluations(recentEvaluation, attempt.recentEvaluation);
      return {
        resolved,
        ...(mergedRecentEvaluation ? { recentEvaluation: mergedRecentEvaluation } : {}),
      };
    }

    recentEvaluation = mergeRecentEvaluations(
      recentEvaluation,
      rewriteTraceCandidateStatus(attempt.recentEvaluation, resolved.providerId, 'rejected'),
    );
    if (import.meta.env.DEV) {
      deps.log.debug?.(
        `mapping:${label}-candidate-suppressed provider=${provider} anilistId=${anilistId} providerId=${resolved.providerId} reason=${resolved.reason}`,
      );
    }
    return null;
  };

  const metadataMedia = buildMediaFromMetadataHint(anilistId, hints?.domMedia);
  if (metadataMedia) {
    const metadataAttempt = await tryResolveWithMedia(
      deps,
      provider,
      metadataMedia,
      credentials,
      hints,
      priority,
      forceLookupNetwork,
    );
    const resolvedFromMetadata = applyAttempt('metadata', metadataAttempt);
    if (resolvedFromMetadata) {
      return resolvedFromMetadata;
    }
  }

  const apiMedia = await deps.anilistApi.fetchMediaWithRelations(
    anilistId,
    priority === undefined
      ? { source: 'mapping-resolve' }
      : { priority, source: 'mapping-resolve' },
  );
  const apiAttempt = await tryResolveWithMedia(
    deps,
    provider,
    apiMedia,
    credentials,
    hints,
    priority,
    forceLookupNetwork,
  );
  const resolvedFromApi = applyAttempt('api', apiAttempt);
  if (resolvedFromApi) {
    return resolvedFromApi;
  }

  deps.log.debug?.(`resolveViaNetwork: provider=${provider} no match found for AniList ID ${anilistId}`);
  return { resolved: null, ...(recentEvaluation ? { recentEvaluation } : {}) };
}

async function tryResolveWithMedia(
  deps: ResolveProviderIdDeps,
  provider: Provider,
  media: AniListMedia,
  credentials: ProviderCredentials,
  hints: ResolveProviderIdOptions['hints'] | undefined,
  priority: RequestPriority | undefined,
  forceLookupNetwork: boolean,
): Promise<ResolutionAttempt> {
  const routedProvider = resolveProviderForAniListFormat(media.format);
  if (routedProvider !== provider) {
    deps.log.debug?.(
      `tryResolveWithMedia: provider mismatch for AniList ID ${media.id} format='${String(media.format)}' expected=${provider} actual=${String(routedProvider)}`,
    );
    return { resolved: null };
  }

  if (provider === 'sonarr') {
    const prequelStatic = await resolvePrequelStatic(media, deps.upstreamMappingStore, deps.anilistApi);
    if (prequelStatic) {
      const recentEvaluation = createSingleCandidateTrace(prequelStatic, 'auto', 'accepted');
      return {
        resolved: prequelStatic,
        ...(recentEvaluation ? { recentEvaluation } : {}),
      };
    }
  }

  const lookupClient = deps.lookupClients[provider];
  const outcome = await resolveViaPipeline(
    media,
    {
      anilistApi: deps.anilistApi,
      lookupClient,
      upstreamMappingStore: deps.upstreamMappingStore,
      credentials,
      ...(priority === undefined ? {} : { priority }),
      ...(forceLookupNetwork ? { forceLookupNetwork: true } : {}),
      sessionSeenCanonical: deps.sessionSeenCanonical[provider],
      limits: {
        maxTerms: MAX_SEARCH_TERMS,
        scoreThreshold: SCORE_THRESHOLD,
        earlyStopThreshold: EARLY_STOP_THRESHOLD,
      },
      log: deps.log,
    },
    hints?.primaryTitle,
  );

  if (outcome.status === 'resolved') {
    const recentEvaluation = createPipelineRecentEvaluation(outcome);
    return {
      resolved: {
        providerId: outcome.providerId,
        reason: outcome.reason,
        ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
      },
      ...(recentEvaluation ? { recentEvaluation } : {}),
    };
  }
  const recentEvaluation = createPipelineRecentEvaluation(outcome);
  return {
    resolved: null,
    ...(recentEvaluation ? { recentEvaluation } : {}),
  };
}
