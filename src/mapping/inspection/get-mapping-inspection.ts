/** Builds one mapping-owned inspection payload without re-running provider resolution. */
// src/mapping/inspection/get-mapping-inspection.ts

import { resolveTitlePreference } from '@/anilist/title-preference';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import type { RadarrMovieSnapshot, SonarrSeriesSnapshot } from '@/providers';
import type { Provider } from '@/providers';
import {
  type MappingAcceptedEvidence,
  type MappingLibraryStatus,
  type MappingRecentEvaluationTrace,
  type MappingSource,
  type MappingStatus,
  type MappingSuppressionKind,
  type ResolverStateRecord,
} from '@/mapping/types';
import { projectMappingReview } from '@/mapping/review/project-review';
import type { MappingReviewReason } from '@/mapping/review/review-types';
import type {
  MappingInspectionCandidate,
  MappingInspectionExplanationItem,
  MappingInspectionLinkedAniListEntry,
  MappingInspectionLibrarySummary,
  MappingInspectionPayload,
  MappingInspectionSuggestedCandidates,
} from './inspection-types';

export interface GetMappingInspectionInput {
  provider: Provider;
  anilistId: number;
}

export interface GetMappingInspectionDeps {
  overridesService: {
    get(provider: Provider, anilistId: number): number | null;
    isIgnored(provider: Provider, anilistId: number): boolean;
    listRejectedCandidates(provider?: Provider): Array<{
      anilistId: number;
      provider: Provider;
      providerId: number;
      updatedAt: number;
    }>;
    getLinkedAniListIds(provider: Provider, providerId: number): number[];
  };
  upstreamMappingStore: {
    get(anilistId: number): { tvdbId: number; source: 'primary' | 'fallback' } | null;
    getAniListIdsForTvdb(tvdbId: number): number[];
  };
  resolverStateStore: {
    get(provider: Provider, anilistId: number): Promise<ResolverStateRecord | null>;
    list(provider?: Provider): Promise<Array<ResolverStateRecord & { anilistId: number; provider: Provider }>>;
  };
  anilistMetadataStore: {
    getMetadata(
      ids: number[],
      options?: { refreshStale?: boolean; maxBatch?: number; fetchMissing?: boolean },
    ): Promise<{ metadata: AniListMetadata[]; missingIds?: number[] }>;
  };
  sonarrLibrary: {
    getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]>;
  };
  radarrLibrary: {
    getLeanMovieList(): Promise<RadarrMovieSnapshot[]>;
  };
}

type InspectionCandidate = {
  provider: Provider;
  anilistId: number;
  providerId: number | null;
  source: MappingSource;
  acceptedEvidence?: MappingAcceptedEvidence;
  recentEvaluation?: MappingRecentEvaluationTrace;
  suppressionKind?: MappingSuppressionKind;
  suppressedProviderId?: number | null;
  exactUpstreamMatchProviderId?: number | null;
  resolverState?: ResolverStateRecord['state'];
  hadResolveAttempt?: boolean;
};

const resolveRecentEvaluationTitle = (
  recentEvaluation: MappingRecentEvaluationTrace | undefined,
): string | undefined => {
  if (!recentEvaluation) {
    return undefined;
  }

  const candidateTitle = recentEvaluation.candidates.find((candidate) => candidate.title)?.title?.trim();
  if (candidateTitle) {
    return candidateTitle;
  }

  return recentEvaluation.searchTerms?.find((term) => term.trim().length > 0)?.trim();
};

const latestRejectedCandidate = (
  rejected: Array<{ anilistId: number; provider: Provider; providerId: number; updatedAt: number }>,
  anilistId: number,
): { anilistId: number; provider: Provider; providerId: number; updatedAt: number } | undefined => (
  rejected
    .filter((entry) => entry.anilistId === anilistId)
    .toSorted((left, right) => right.updatedAt - left.updatedAt)[0]
);

const withRejectedConflict = (
  candidate: InspectionCandidate,
  rejected: { providerId: number } | undefined,
): InspectionCandidate => {
  if (!rejected) {
    return candidate;
  }

  return {
    ...candidate,
    suppressedProviderId: rejected.providerId,
    suppressionKind: candidate.suppressionKind ?? 'rejected-candidate',
  };
};

const buildInspectionCandidate = (
  input: GetMappingInspectionInput,
  state: {
    manualProviderId: number | null;
    ignored: boolean;
    upstreamProviderId: number | null;
    rejected: { providerId: number } | undefined;
    resolverState: ResolverStateRecord | null;
  },
): InspectionCandidate => {
  if (state.manualProviderId !== null) {
    if (state.upstreamProviderId !== null && state.upstreamProviderId === state.manualProviderId) {
      return withRejectedConflict(
        {
          ...input,
          providerId: state.manualProviderId,
          source: 'upstream',
          acceptedEvidence: {
            source: 'upstream',
            reason: 'exact-upstream',
          },
          ...(state.resolverState?.state === 'mapped' && state.resolverState.recentEvaluation
            ? { recentEvaluation: state.resolverState.recentEvaluation }
            : {}),
          resolverState: 'mapped',
          hadResolveAttempt: true,
        },
        state.rejected,
      );
    }

    return withRejectedConflict(
      {
        ...input,
        providerId: state.manualProviderId,
        source: 'manual',
        acceptedEvidence: {
          source: 'manual',
          reason: 'manual-override',
        },
        resolverState: 'mapped',
        exactUpstreamMatchProviderId: state.upstreamProviderId,
        hadResolveAttempt: true,
      },
      state.rejected,
    );
  }

  if (state.ignored) {
    return withRejectedConflict(
      {
        ...input,
        providerId: null,
        source: 'ignored',
        suppressionKind: 'ignored-entry',
        exactUpstreamMatchProviderId: state.upstreamProviderId,
        hadResolveAttempt: true,
      },
      state.rejected,
    );
  }

  if (state.upstreamProviderId !== null) {
    return withRejectedConflict(
      {
        ...input,
        providerId: state.upstreamProviderId,
        source: 'upstream',
        acceptedEvidence: {
          source: 'upstream',
          reason: 'exact-upstream',
        },
        ...(state.resolverState?.state === 'mapped' && state.resolverState.recentEvaluation
          ? { recentEvaluation: state.resolverState.recentEvaluation }
          : {}),
        resolverState: 'mapped',
      },
      state.rejected,
    );
  }

  if (state.resolverState?.state === 'mapped') {
    return withRejectedConflict(
      {
        ...input,
        providerId: state.resolverState.providerId,
        source: state.resolverState.acceptedEvidence.source,
        acceptedEvidence: state.resolverState.acceptedEvidence,
        ...(state.resolverState.recentEvaluation ? { recentEvaluation: state.resolverState.recentEvaluation } : {}),
        resolverState: 'mapped',
        hadResolveAttempt: state.resolverState.acceptedEvidence.source === 'auto',
      },
      state.rejected,
    );
  }

  if (state.rejected) {
    return {
      ...input,
      providerId: null,
      source: 'rejected',
      suppressedProviderId: state.rejected.providerId,
      suppressionKind: 'rejected-candidate',
      hadResolveAttempt: true,
    };
  }

  if (state.resolverState) {
    return {
      ...input,
      providerId: null,
      source: 'unresolved',
      ...(state.resolverState.recentEvaluation ? { recentEvaluation: state.resolverState.recentEvaluation } : {}),
      resolverState: state.resolverState.state,
      hadResolveAttempt: true,
    };
  }

  return {
    ...input,
    providerId: null,
    source: 'unresolved',
    hadResolveAttempt: false,
  };
};

const buildLibrarySummary = (
  provider: Provider,
  providerId: number | null,
  libraryEntry: SonarrSeriesSnapshot | RadarrMovieSnapshot | null,
  recentEvaluation: MappingRecentEvaluationTrace | undefined,
): MappingInspectionLibrarySummary => {
  const status: MappingLibraryStatus = providerId === null
    ? 'unmapped'
    : (libraryEntry ? 'in-provider' : 'not-in-provider');
  const fallbackTitle = resolveRecentEvaluationTitle(recentEvaluation);

  if (libraryEntry === null) {
    return {
      status,
      ...(fallbackTitle
        ? {
            title: fallbackTitle,
            type: provider === 'sonarr' ? 'series' : 'movie',
          }
        : {}),
    };
  }

  if (provider === 'sonarr') {
    const series = libraryEntry as SonarrSeriesSnapshot;
    let inLibraryCount: number | undefined;
    if (series.statistics?.episodeCount !== undefined) {
      inLibraryCount = series.statistics.episodeCount;
    } else if (series.statistics?.episodeFileCount !== undefined) {
      inLibraryCount = series.statistics.episodeFileCount;
    }

    return {
      status,
      ...(series.title ? { title: series.title } : {}),
      type: 'series',
      ...(series.status ? { statusLabel: series.status } : {}),
      ...(inLibraryCount === undefined ? {} : { inLibraryCount }),
    };
  }

  const movie = libraryEntry as RadarrMovieSnapshot;
  const inLibraryCount = movie.hasFile === undefined ? undefined : (movie.hasFile ? 1 : 0);

  return {
    status,
    ...(movie.title ? { title: movie.title } : {}),
    type: 'movie',
    ...(movie.status ? { statusLabel: movie.status } : {}),
    ...(inLibraryCount === undefined ? {} : { inLibraryCount }),
  };
};

const buildSuggestedCandidates = (
  recentEvaluation: MappingRecentEvaluationTrace | undefined,
): MappingInspectionSuggestedCandidates => {
  const suggested: MappingInspectionSuggestedCandidates = {
    ...(recentEvaluation?.attemptedAt ? { attemptedAt: recentEvaluation.attemptedAt } : {}),
    ...(recentEvaluation?.searchTerms ? { searchTerms: recentEvaluation.searchTerms } : {}),
    accepted: [],
    rejected: [],
    suppressed: [],
    notAccepted: [],
  };

  for (const candidate of recentEvaluation?.candidates ?? []) {
    const projected: MappingInspectionCandidate = {
      providerId: candidate.providerId,
      ...(candidate.title ? { title: candidate.title } : {}),
      source: candidate.source,
      reason: candidate.reason,
      status: candidate.status,
      summary: candidate.summary,
      ...(candidate.score === undefined ? {} : { score: candidate.score }),
      ...(candidate.inheritedVerification ? { inheritedVerification: candidate.inheritedVerification } : {}),
    };

    switch (candidate.status) {
      case 'accepted': {
        suggested.accepted = [...suggested.accepted, projected];
        break;
      }
      case 'rejected': {
        suggested.rejected = [...suggested.rejected, projected];
        break;
      }
      case 'suppressed': {
        suggested.suppressed = [...suggested.suppressed, projected];
        break;
      }
      case 'not-accepted': {
        suggested.notAccepted = [...suggested.notAccepted, projected];
        break;
      }
    }
  }

  return suggested;
};

const formatReviewReason = (reason: MappingReviewReason): string => {
  switch (reason) {
    case 'manual-upstream-disagreement': {
      return 'Manual mapping conflicts with exact upstream mapping.';
    }
    case 'ignored-but-exact-upstream': {
      return 'Ignored entry now has an exact upstream mapping.';
    }
    case 'verification-failed-inherited-candidate': {
      return 'A strong inherited candidate could not be operationally verified.';
    }
    case 'ambiguous-inherited-conflict': {
      return 'Inherited relation anchors proposed conflicting provider IDs.';
    }
  }
};

const buildExplanationItems = (
  candidate: InspectionCandidate,
  reviewReasons: readonly MappingReviewReason[],
): MappingInspectionExplanationItem[] => {
  const items: MappingInspectionExplanationItem[] = [];
  const evidence = candidate.acceptedEvidence;

  if (evidence) {
    const details: string[] = [];
    if (evidence.successfulTitle) {
      details.push(`Matched with title "${evidence.successfulTitle}".`);
    }
    if (evidence.immediateSourceAniListId) {
      details.push(`Immediate source AniList ID ${evidence.immediateSourceAniListId}.`);
    }
    if (evidence.chainAnchorAniListId) {
      details.push(`Chain anchor AniList ID ${evidence.chainAnchorAniListId}.`);
    }
    if (evidence.inheritedVerification) {
      details.push(
        evidence.inheritedVerification.reason,
        ...evidence.inheritedVerification.positiveSignals,
        ...evidence.inheritedVerification.contradictions,
      );
    }

    let summary = 'Accepted mapping is currently effective.';
    switch (evidence.reason) {
      case 'exact-upstream': {
        summary = 'Exact upstream mapping is currently effective.';
        break;
      }
      case 'manual-override': {
        summary = 'Manual mapping override is currently effective.';
        break;
      }
      case 'exact-title-match': {
        summary = 'Automatic exact title match is currently effective.';
        break;
      }
      case 'verified-inherited': {
        summary = 'Inherited mapping from a related AniList entry was verified and accepted.';
        break;
      }
      case 'fuzzy-match': {
        summary = 'Fuzzy fallback match is currently effective.';
        break;
      }
      case 'borrowed-base-title-fallback': {
        summary = 'Borrowed base-title fallback match is currently effective.';
        break;
      }
    }

    items.push({
      kind: 'effective-source',
      summary,
      source: evidence.source,
      reason: evidence.reason,
      ...(evidence.immediateSourceAniListId ? { immediateSourceAniListId: evidence.immediateSourceAniListId } : {}),
      ...(evidence.chainAnchorAniListId ? { chainAnchorAniListId: evidence.chainAnchorAniListId } : {}),
      ...(details.length > 0 ? { details } : {}),
    });
  }

  if (candidate.suppressionKind === 'ignored-entry') {
    items.push({
      kind: 'suppression',
      summary: 'This AniList entry is currently ignored for this provider.',
    });
  } else if (candidate.suppressionKind === 'rejected-candidate' && candidate.suppressedProviderId) {
    items.push({
      kind: 'suppression',
      summary: `Candidate ${candidate.suppressedProviderId} was rejected for this AniList entry.`,
      suppressedProviderId: candidate.suppressedProviderId,
    });
  }

  if (candidate.resolverState && candidate.resolverState !== 'mapped') {
    let summary = 'No effective mapping is currently resolved.';
    switch (candidate.resolverState) {
      case 'ambiguous': {
        summary = 'Resolution is currently ambiguous.';
        break;
      }
      case 'verification-failed': {
        summary = 'A strong inherited candidate could not be operationally verified.';
        break;
      }
      case 'unresolved': {
        summary = 'No acceptable mapping was accepted in the last resolution attempt.';
        break;
      }
    }
    items.push({
      kind: 'resolver-outcome',
      summary,
      resolverOutcome: candidate.resolverState,
    });
  }

  for (const reason of reviewReasons) {
    items.push({
      kind: 'review',
      summary: formatReviewReason(reason),
      reviewReason: reason,
    });
  }

  if (items.length === 0) {
    items.push({
      kind: 'resolver-outcome',
      summary: 'No effective mapping is currently stored for this AniList entry.',
    });
  }

  return items;
};

const buildLinkedAniListEntries = (
  anilistId: number,
  linkedAniListIds: readonly number[],
  metadataById: Map<number, AniListMetadata>,
): MappingInspectionLinkedAniListEntry[] => linkedAniListIds.map((linkedAniListId) => {
  const metadata = metadataById.get(linkedAniListId);
  const title = metadata
    ? resolveTitlePreference({ titles: metadata.titles }).primary
    : undefined;

  return {
    anilistId: linkedAniListId,
    ...(title ? { title } : {}),
    ...(metadata?.format === undefined ? {} : { format: metadata.format }),
    ...(metadata?.seasonYear === undefined ? {} : { year: metadata.seasonYear }),
    ...(linkedAniListId === anilistId ? { relation: 'current' } : {}),
  };
});

async function collectLinkedAniListIds(
  provider: Provider,
  providerId: number,
  deps: GetMappingInspectionDeps,
): Promise<number[]> {
  const ids = new Set<number>(deps.overridesService.getLinkedAniListIds(provider, providerId));
  if (provider === 'sonarr') {
    for (const id of deps.upstreamMappingStore.getAniListIdsForTvdb(providerId)) {
      ids.add(id);
    }
  }

  const resolverStates = await deps.resolverStateStore.list(provider);
  for (const resolverState of resolverStates) {
    if (resolverState.state === 'mapped' && resolverState.providerId === providerId) {
      ids.add(resolverState.anilistId);
    }
  }

  return [...ids].toSorted((left, right) => left - right);
}

export async function getMappingInspection(
  input: GetMappingInspectionInput,
  deps: GetMappingInspectionDeps,
): Promise<MappingInspectionPayload> {
  const manualProviderId = deps.overridesService.get(input.provider, input.anilistId);
  const ignored = deps.overridesService.isIgnored(input.provider, input.anilistId);
  const upstreamProviderId = input.provider === 'sonarr'
    ? deps.upstreamMappingStore.get(input.anilistId)?.tvdbId ?? null
    : null;
  const rejected = latestRejectedCandidate(
    deps.overridesService.listRejectedCandidates(input.provider),
    input.anilistId,
  );

  const [resolverState, seriesList, movieList] = await Promise.all([
    deps.resolverStateStore.get(input.provider, input.anilistId),
    input.provider === 'sonarr'
      ? deps.sonarrLibrary.getLeanSeriesList()
      : Promise.resolve([] as SonarrSeriesSnapshot[]),
    input.provider === 'radarr'
      ? deps.radarrLibrary.getLeanMovieList()
      : Promise.resolve([] as RadarrMovieSnapshot[]),
  ]);

  const candidate = buildInspectionCandidate(input, {
    manualProviderId,
    ignored,
    upstreamProviderId,
    rejected,
    resolverState,
  });

  let libraryEntry: SonarrSeriesSnapshot | RadarrMovieSnapshot | null = null;
  if (candidate.providerId !== null) {
    libraryEntry = input.provider === 'sonarr'
      ? (seriesList.find((series) => series.tvdbId === candidate.providerId) ?? null)
      : (movieList.find((movie) => movie.tmdbId === candidate.providerId) ?? null);
  }
  const library = buildLibrarySummary(input.provider, candidate.providerId, libraryEntry, candidate.recentEvaluation);
  const linkedAniListIds = candidate.providerId === null
    ? []
    : await collectLinkedAniListIds(input.provider, candidate.providerId, deps);
  const linkedIdsWithCurrent = candidate.providerId === null
    ? []
    : [...new Set([input.anilistId, ...linkedAniListIds])].toSorted((left, right) => left - right);
  const linkedMetadata = linkedIdsWithCurrent.length > 0
    ? await deps.anilistMetadataStore.getMetadata(linkedIdsWithCurrent, {
        refreshStale: false,
        fetchMissing: false,
      })
    : { metadata: [] as AniListMetadata[] };
  const metadataById = new Map(linkedMetadata.metadata.map((entry) => [entry.id, entry] as const));

  const reviewProjection = projectMappingReview({
    source: candidate.source,
    providerId: candidate.providerId,
    ...(candidate.acceptedEvidence ? { acceptedEvidence: candidate.acceptedEvidence } : {}),
    ...(candidate.recentEvaluation ? { recentEvaluation: candidate.recentEvaluation } : {}),
    ...(candidate.resolverState ? { resolverState: candidate.resolverState } : {}),
    ...(candidate.exactUpstreamMatchProviderId === undefined
      ? {}
      : { exactUpstreamMatchProviderId: candidate.exactUpstreamMatchProviderId }),
  });

  let status: MappingStatus;
  if (reviewProjection.reviewSummary) {
    status = 'needs-review';
  } else if (candidate.providerId === null) {
    status = candidate.suppressionKind ? 'suppressed' : 'unresolved';
  } else if (library.status === 'in-provider') {
    status = 'in-library';
  } else {
    status = 'can-add';
  }

  return {
    effectiveMapping: {
      provider: input.provider,
      anilistId: input.anilistId,
      providerId: candidate.providerId,
      ...(candidate.suppressedProviderId === undefined ? {} : { suppressedProviderId: candidate.suppressedProviderId }),
      status,
      libraryStatus: library.status,
      ...(candidate.acceptedEvidence?.source ? { effectiveSource: candidate.acceptedEvidence.source } : {}),
      ...(candidate.acceptedEvidence?.reason ? { effectiveReason: candidate.acceptedEvidence.reason } : {}),
      ...(candidate.resolverState ? { resolverOutcome: candidate.resolverState } : {}),
      ...(candidate.suppressionKind ? { suppressionKind: candidate.suppressionKind } : {}),
      ...(candidate.hadResolveAttempt ? { hadResolveAttempt: true } : {}),
      ...(candidate.acceptedEvidence ? { evidence: candidate.acceptedEvidence } : {}),
      library,
    },
    providerContext: {
      provider: input.provider,
      providerId: candidate.providerId,
      linkedAniListIds: linkedIdsWithCurrent,
      linkedAniListCount: linkedIdsWithCurrent.length,
    },
    linkedAniListEntries: buildLinkedAniListEntries(input.anilistId, linkedIdsWithCurrent, metadataById),
    whyThisExists: buildExplanationItems(
      candidate,
      reviewProjection.reviewSummary?.reasons ?? [],
    ),
    suggestedCandidates: buildSuggestedCandidates(candidate.recentEvaluation),
    review: {
      needsReview: reviewProjection.reviewSummary !== undefined,
      ...(reviewProjection.reviewSummary ? { summary: reviewProjection.reviewSummary } : {}),
      ...(reviewProjection.reviewItems ? { items: reviewProjection.reviewItems } : {}),
    },
  };
}
