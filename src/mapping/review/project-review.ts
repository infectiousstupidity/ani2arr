/** Projects review-worthy mapping conflicts from effective state and resolver traces. */
// src/mapping/review/project-review.ts

import type {
  MappingAcceptedEvidence,
  MappingRecentEvaluationTrace,
  MappingResolverState,
  MappingSource,
} from '@/mapping/types';
import type {
  MappingReviewItem,
  MappingReviewState,
  MappingReviewSummary,
} from './review-types';

export interface ProjectMappingReviewInput {
  source: MappingSource;
  providerId: number | null;
  acceptedEvidence?: MappingAcceptedEvidence;
  recentEvaluation?: MappingRecentEvaluationTrace;
  resolverState?: MappingResolverState;
  exactUpstreamMatchProviderId?: number | null;
}

export interface ProjectMappingReviewOutput {
  reviewSummary?: MappingReviewSummary;
  reviewItems?: readonly MappingReviewItem[];
}

type InheritedCandidateProjection = {
  providerId: number;
  immediateSourceAniListId?: number;
  chainAnchorAniListId?: number;
};

const buildReviewState = (input: {
  source: MappingReviewState['source'];
  providerId: number | null;
  resolverState?: MappingReviewState['resolverState'] | undefined;
  acceptedReason?: MappingReviewState['acceptedReason'] | undefined;
  immediateSourceAniListId?: number | undefined;
  chainAnchorAniListId?: number | undefined;
}): MappingReviewState => ({
  source: input.source,
  providerId: input.providerId,
  ...(input.resolverState ? { resolverState: input.resolverState } : {}),
  ...(input.acceptedReason ? { acceptedReason: input.acceptedReason } : {}),
  ...(input.immediateSourceAniListId ? { immediateSourceAniListId: input.immediateSourceAniListId } : {}),
  ...(input.chainAnchorAniListId ? { chainAnchorAniListId: input.chainAnchorAniListId } : {}),
});

const getInheritedCandidates = (
  recentEvaluation: MappingRecentEvaluationTrace | undefined,
): InheritedCandidateProjection[] => {
  if (!recentEvaluation) {
    return [];
  }

  const candidates: InheritedCandidateProjection[] = [];
  const seen = new Set<number>();
  for (const candidate of recentEvaluation.candidates) {
    if (candidate.reason !== 'verified-inherited' || seen.has(candidate.providerId)) {
      continue;
    }
    seen.add(candidate.providerId);
    candidates.push({
      providerId: candidate.providerId,
      ...(candidate.inheritedVerification?.immediateSourceAniListId
        ? { immediateSourceAniListId: candidate.inheritedVerification.immediateSourceAniListId }
        : {}),
      ...(candidate.inheritedVerification?.chainAnchorAniListId
        ? { chainAnchorAniListId: candidate.inheritedVerification.chainAnchorAniListId }
        : {}),
    });
  }

  return candidates;
};

const buildSummary = (reviewItems: readonly MappingReviewItem[]): MappingReviewSummary | undefined => {
  if (reviewItems.length === 0) {
    return undefined;
  }

  const reasons: MappingReviewSummary['reasons'] = [...new Set(reviewItems.map(item => item.reason))];
  return {
    count: reviewItems.length,
    primaryReason: reviewItems[0]!.reason,
    reasons,
  };
};

export function projectMappingReview(
  input: ProjectMappingReviewInput,
): ProjectMappingReviewOutput {
  const current = buildReviewState({
    source: input.source,
    providerId: input.providerId,
    resolverState: input.resolverState,
    acceptedReason: input.acceptedEvidence?.reason,
    immediateSourceAniListId: input.acceptedEvidence?.immediateSourceAniListId,
    chainAnchorAniListId: input.acceptedEvidence?.chainAnchorAniListId,
  });
  const reviewItems: MappingReviewItem[] = [];

  if (
    input.source === 'manual' &&
    input.providerId !== null &&
    typeof input.exactUpstreamMatchProviderId === 'number' &&
    input.exactUpstreamMatchProviderId !== input.providerId
  ) {
    reviewItems.push({
      reason: 'manual-upstream-disagreement',
      summary: 'Manual mapping disagrees with exact upstream mapping.',
      current,
      proposed: buildReviewState({
        source: 'upstream',
        providerId: input.exactUpstreamMatchProviderId,
        resolverState: 'mapped',
        acceptedReason: 'exact-upstream',
      }),
      actions: ['keep-current', 'use-exact-upstream'],
    });
  }

  if (input.source === 'ignored' && typeof input.exactUpstreamMatchProviderId === 'number') {
    reviewItems.push({
      reason: 'ignored-but-exact-upstream',
      summary: 'Ignored title now has an exact upstream mapping available.',
      current,
      proposed: buildReviewState({
        source: 'upstream',
        providerId: input.exactUpstreamMatchProviderId,
        resolverState: 'mapped',
        acceptedReason: 'exact-upstream',
      }),
      actions: ['keep-current', 'clear-ignore'],
    });
  }

  const inheritedCandidates = getInheritedCandidates(input.recentEvaluation);

  if (input.resolverState === 'verification-failed' && inheritedCandidates.length > 0) {
    const candidate = inheritedCandidates[0]!;
    reviewItems.push({
      reason: 'verification-failed-inherited-candidate',
      summary: 'Inherited candidate could not be operationally verified.',
      current,
      proposed: buildReviewState({
        source: 'auto',
        providerId: candidate.providerId,
        acceptedReason: 'verified-inherited',
        immediateSourceAniListId: candidate.immediateSourceAniListId,
        chainAnchorAniListId: candidate.chainAnchorAniListId,
      }),
      actions: ['retry-resolution', 'set-manual-mapping'],
    });
  }

  if (input.resolverState === 'ambiguous' && inheritedCandidates.length > 1) {
    reviewItems.push({
      reason: 'ambiguous-inherited-conflict',
      summary: 'Inherited relation anchors proposed conflicting provider IDs.',
      current,
      conflicts: inheritedCandidates.map(candidate => buildReviewState({
        source: 'auto',
        providerId: candidate.providerId,
        acceptedReason: 'verified-inherited',
        immediateSourceAniListId: candidate.immediateSourceAniListId,
        chainAnchorAniListId: candidate.chainAnchorAniListId,
      })),
      actions: ['inspect-candidates', 'set-manual-mapping'],
    });
  }

  const reviewSummary = buildSummary(reviewItems);
  return reviewSummary
    ? {
        reviewSummary,
        reviewItems,
      }
    : {};
}
