/** Auto-mapping workflow for lookup, scoring, persistence, and cached auto outcomes. */
// src/mapping/auto-mapping/resolve-auto-mapping.ts

import type { AniListId, AniListMediaService  } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import {
  readExtensionMappingFailure,
  removeExtensionMappingFailure,
  writeExtensionMappingFailure,
} from '@/mapping/cache/extension-mapping.cache';
import type { Provider, ProviderCredentials, SonarrLookupSeries  } from '@/providers';
import { getProviderLabel } from '@/providers/provider-labels';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
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
  SCORE_THRESHOLD,
} from '../constants';
import { tryHintLookup } from '../hints/hint-lookup';
import { buildMediaFromMetadataHint } from '../hints/media-hints';
import { attemptVerifiedInheritedSonarrResolution } from '../hints/verified-inheritance';
import type { ProviderLookupClient, ProviderLookupResult } from '../lookup';
import type { ManualMappingService } from '../manual';
import { resolveViaPipeline } from '../pipeline/pipeline';
import {
  createPipelineRecentEvaluation,
  createRecentEvaluationTrace,
  createSingleCandidateTrace,
  mergeRecentEvaluations,
  rewriteTraceCandidateStatus,
} from '../recent-evaluation';
import {
  UNRESOLVED_AUTO_MAPPING_TTL,
  type AutoMappingStore,
} from './auto-mapping.store';
import {
  resolveUnresolvedSearchTerms,
  shouldCacheFailure,
} from '../resolution-policy';
import type { AnibridgeMappingStore } from '../upstream';
import type {
  MappingAcceptedSource,
  MappingRecentEvaluationTrace,
} from "../types";
import type {
  AutoMappingSource,
  AutoMappingOptions,
  AcceptedAutoMapping,
  AutoMappingRecord,
} from './types';

type ProviderLookupRegistry = Record<
  Provider,
  ProviderLookupClient<ProviderCredentials, ProviderLookupResult>
>;

type ResolutionAttempt = {
  resolved: AcceptedAutoMapping | null;
  recentEvaluation?: MappingRecentEvaluationTrace;
  terminalState?: Exclude<AutoMappingRecord['state'], 'mapped' | 'unresolved'>;
};

type ManualMappingReads = Pick<ManualMappingService, 'isIgnored' | 'get'>;

type ResolveAutoMappingDeps = {
  anilistApi: AniListMediaService;
  anibridgeMappingStore: AnibridgeMappingStore;
  lookupClients: ProviderLookupRegistry;
  autoMappingStore: Pick<AutoMappingStore, 'get'>;
  log: ScopedLogger;
  sessionSeenCanonical: Record<Provider, Set<string>>;
  manualMappings?: ManualMappingReads;
  acceptResolved: (
    provider: Provider,
    anilistId: AniListId,
    resolved: AcceptedAutoMapping,
    source: AutoMappingSource,
  ) => Promise<AcceptedAutoMapping | null>;
  recordAutoMapping: (
    provider: Provider,
    anilistId: AniListId,
    state: Omit<AutoMappingRecord, 'updatedAt'>,
    ttl: { hardMs: number },
  ) => Promise<void>;
  clearAutoMapping: (provider: Provider, anilistId: AniListId) => Promise<void>;
  getConfiguredCredentials: (provider: Provider) => Promise<ProviderCredentials>;
  isResolvedCandidateSuppressed: (
    provider: Provider,
    anilistId: AniListId,
    resolved: AcceptedAutoMapping,
    source: MappingAcceptedSource,
  ) => boolean;
};

export async function resolveAutoMapping(
  deps: ResolveAutoMappingDeps,
  provider: Provider,
  anilistId: AniListId,
  options: AutoMappingOptions,
  bypassCachedResolutionState: boolean,
): Promise<AcceptedAutoMapping | null> {
  let resolverState = await deps.autoMappingStore.get(provider, anilistId);
  if (resolverState?.state === 'mapped') {
    if (resolverState.acceptedEvidence.source !== 'auto') {
      await deps.clearAutoMapping(provider, anilistId);
      resolverState = null;
    } else if (
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
      await deps.clearAutoMapping(provider, anilistId);
      resolverState = null;
    } else {
      if (import.meta.env.DEV) {
        deps.log.debug?.(
          `mapping:auto-mapping-hit provider=${provider} anilistId=${anilistId} providerId=${resolverState.providerId} source=${resolverState.acceptedEvidence.source} reason=${resolverState.acceptedEvidence.reason}`,
        );
      }
      return {
        providerId: resolverState.providerId,
        reason: resolverState.acceptedEvidence.reason,
        ...(resolverState.acceptedEvidence.successfulTitle
          ? { successfulSynonym: resolverState.acceptedEvidence.successfulTitle }
          : {}),
      };
    }
  }
  if (!bypassCachedResolutionState) {
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
          `mapping:auto-mapping-terminal provider=${provider} anilistId=${anilistId} state=${resolverState.state}`,
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
    bypassCachedResolutionState,
    seededRecentEvaluation,
  );
}

async function attemptNetworkResolution(
  deps: ResolveAutoMappingDeps,
  provider: Provider,
  anilistId: AniListId,
  options: AutoMappingOptions,
  bypassCachedResolutionState: boolean,
  seededRecentEvaluation?: MappingRecentEvaluationTrace,
): Promise<AcceptedAutoMapping | null> {
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
      await deps.recordAutoMapping(
        provider,
        anilistId,
        {
          state: 'unresolved',
          ...(recentEvaluation ? { recentEvaluation } : {}),
        },
        UNRESOLVED_AUTO_MAPPING_TTL,
      );
      await removeExtensionMappingFailure(provider, anilistId);
      return null;
    }

    if (!bypassCachedResolutionState && shouldCacheFailure(normalized)) {
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
    const terminalState = attempt.terminalState ?? 'unresolved';
    await deps.recordAutoMapping(
      provider,
      anilistId,
      {
        state: terminalState,
        ...(recentEvaluation ? { recentEvaluation } : {}),
      },
      UNRESOLVED_AUTO_MAPPING_TTL,
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
  anilistId: AniListId,
  error: ExtensionError,
): Promise<void> {
  await writeExtensionMappingFailure(provider, anilistId, error);
}

async function resolveViaNetwork(
  deps: ResolveAutoMappingDeps,
  provider: Provider,
  anilistId: AniListId,
  hints: AutoMappingOptions['hints'] | undefined,
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
      false,
    );
    if (metadataAttempt.terminalState) {
      return metadataAttempt;
    }
    const resolvedFromMetadata = applyAttempt('metadata', metadataAttempt);
    if (resolvedFromMetadata) {
      return resolvedFromMetadata;
    }
  }

  const anilistMediaWithRelations = await deps.anilistApi.fetchMediaWithRelations(
    anilistId,
    priority === undefined
      ? { source: 'mapping-resolve' }
      : { priority, source: 'mapping-resolve' },
  );
  const apiAttempt = await tryResolveWithMedia(
    deps,
    provider,
    anilistMediaWithRelations,
    credentials,
    hints,
    priority,
    forceLookupNetwork,
    true,
  );
  if (apiAttempt.terminalState) {
    return apiAttempt;
  }
  const resolvedFromApi = applyAttempt('api', apiAttempt);
  if (resolvedFromApi) {
    return resolvedFromApi;
  }

  deps.log.debug?.(`resolveViaNetwork: provider=${provider} no match found for AniList ID ${anilistId}`);
  return { resolved: null, ...(recentEvaluation ? { recentEvaluation } : {}) };
}

async function tryResolveWithMedia(
  deps: ResolveAutoMappingDeps,
  provider: Provider,
  media: AniListMedia,
  credentials: ProviderCredentials,
  hints: AutoMappingOptions['hints'] | undefined,
  priority: RequestPriority | undefined,
  forceLookupNetwork: boolean,
  allowInheritedTraversal: boolean,
): Promise<ResolutionAttempt> {
  const routedProvider = resolveProviderForAniListFormat(media.format);
  if (routedProvider !== provider) {
    deps.log.debug?.(
      `tryResolveWithMedia: provider mismatch for AniList ID ${media.id} format='${String(media.format)}' expected=${provider} actual=${String(routedProvider)}`,
    );
    return { resolved: null };
  }

  let recentEvaluation: MappingRecentEvaluationTrace | undefined;

  if (provider === 'sonarr' && allowInheritedTraversal) {
    const inheritedAttempt = await attemptVerifiedInheritedSonarrResolution({
      media,
      anilistApi: deps.anilistApi,
      anibridgeMappingStore: deps.anibridgeMappingStore,
      lookupClient: deps.lookupClients.sonarr as ProviderLookupClient<ProviderCredentials, SonarrLookupSeries>,
      credentials,
      ...(deps.manualMappings ? { manualMappings: deps.manualMappings } : {}),
    });

    recentEvaluation = mergeRecentEvaluations(recentEvaluation, inheritedAttempt.recentEvaluation);

    if (inheritedAttempt.status === 'accepted') {
      if (!deps.isResolvedCandidateSuppressed(provider, media.id, inheritedAttempt.resolved, 'auto')) {
        return {
          resolved: inheritedAttempt.resolved,
          ...(recentEvaluation ? { recentEvaluation } : {}),
        };
      }

      recentEvaluation = mergeRecentEvaluations(
        recentEvaluation,
        rewriteTraceCandidateStatus(
          createSingleCandidateTrace(inheritedAttempt.resolved, 'auto', 'accepted'),
          inheritedAttempt.resolved.providerId,
          'rejected',
        ),
      );
    }

    if (inheritedAttempt.status === 'ambiguous' || inheritedAttempt.status === 'verification-failed') {
      return {
        resolved: null,
        terminalState: inheritedAttempt.status,
        ...(recentEvaluation ? { recentEvaluation } : {}),
      };
    }

    if (inheritedAttempt.status === 'rejected' && inheritedAttempt.borrowedBaseTitle) {
      const borrowed = await tryHintLookup(
        inheritedAttempt.borrowedBaseTitle,
        deps.lookupClients.sonarr,
        credentials,
        deps.log,
        forceLookupNetwork,
      );
      if (borrowed) {
        const borrowedTrace = createSingleCandidateTrace(
          borrowed,
          'auto',
          'accepted',
          [inheritedAttempt.borrowedBaseTitle],
          borrowed.successfulSynonym,
        );
        recentEvaluation = mergeRecentEvaluations(recentEvaluation, borrowedTrace);

        if (!deps.isResolvedCandidateSuppressed(provider, media.id, borrowed, 'auto')) {
          return {
            resolved: borrowed,
            ...(recentEvaluation ? { recentEvaluation } : {}),
          };
        }

        recentEvaluation = mergeRecentEvaluations(
          recentEvaluation,
          rewriteTraceCandidateStatus(borrowedTrace, borrowed.providerId, 'rejected'),
        );
      }
    }
  }

  const lookupClient = deps.lookupClients[provider];
  const outcome = await resolveViaPipeline(
    media,
    {
      anilistApi: deps.anilistApi,
      lookupClient,
      anibridgeMappingStore: deps.anibridgeMappingStore,
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
    recentEvaluation = mergeRecentEvaluations(recentEvaluation, createPipelineRecentEvaluation(outcome));
    return {
      resolved: {
        providerId: outcome.providerId,
        reason: outcome.reason,
        ...(outcome.successfulSynonym ? { successfulSynonym: outcome.successfulSynonym } : {}),
      },
      ...(recentEvaluation ? { recentEvaluation } : {}),
    };
  }
  recentEvaluation = mergeRecentEvaluations(recentEvaluation, createPipelineRecentEvaluation(outcome));
  return {
    resolved: null,
    ...(recentEvaluation ? { recentEvaluation } : {}),
  };
}
