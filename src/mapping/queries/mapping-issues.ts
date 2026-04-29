/** Projects review-worthy mapping conflicts from effective state and resolver traces. */
// src/mapping/queries/mapping-issues.ts

import type { AniListId } from '@/anilist';
import type { ProviderTargetId } from '@/providers';
import type {
  AcceptedMappingEvidence,
  AcceptedMappingReason,
  EffectiveMappingKind,
  RecentMappingEvaluationTrace,
} from '@/mapping/types';
import type { AutoMappingStatus } from '@/mapping/auto-mapping/types';

export type MappingIssueReason =
  | 'manual-upstream-disagreement'
  | 'ignored-but-exact-upstream'
  | 'verification-failed-inherited-candidate'
  | 'ambiguous-inherited-conflict';

export type MappingIssueAction =
  | 'keep-current'
  | 'use-exact-upstream'
  | 'clear-ignore'
  | 'retry-resolution'
  | 'inspect-candidates'
  | 'set-manual-mapping';

type MappingIssueMappingSnapshot = {
  mappingEntryKind: EffectiveMappingKind;
  providerId: ProviderTargetId | null;
  autoMappingStatus?: AutoMappingStatus;
  acceptedReason?: AcceptedMappingReason;
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
};

export interface MappingIssue {
  reason: MappingIssueReason;
  summary: string;
  current: MappingIssueMappingSnapshot;
  proposed?: MappingIssueMappingSnapshot;
  conflicts?: readonly MappingIssueMappingSnapshot[];
  actions: readonly MappingIssueAction[];
}

export interface MappingIssuesSummary {
  count: number;
  primaryReason: MappingIssueReason;
  reasons: readonly MappingIssueReason[];
}

type InheritedCandidateProjection = {
  providerId: ProviderTargetId;
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
};

const buildReviewState = (input: {
  mappingEntryKind: MappingIssueMappingSnapshot['mappingEntryKind'];
  providerId: ProviderTargetId | null;
  autoMappingStatus?: MappingIssueMappingSnapshot['autoMappingStatus'] | undefined;
  acceptedReason?: MappingIssueMappingSnapshot['acceptedReason'] | undefined;
  immediateSourceAniListId?: AniListId | undefined;
  chainAnchorAniListId?: AniListId | undefined;
}): MappingIssueMappingSnapshot => ({
  mappingEntryKind: input.mappingEntryKind,
  providerId: input.providerId,
  ...(input.autoMappingStatus ? { autoMappingStatus: input.autoMappingStatus } : {}),
  ...(input.acceptedReason ? { acceptedReason: input.acceptedReason } : {}),
  ...(input.immediateSourceAniListId ? { immediateSourceAniListId: input.immediateSourceAniListId } : {}),
  ...(input.chainAnchorAniListId ? { chainAnchorAniListId: input.chainAnchorAniListId } : {}),
});

const getInheritedCandidates = (
  recentEvaluation: RecentMappingEvaluationTrace | undefined,
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

const buildSummary = (reviewItems: readonly MappingIssue[]): MappingIssuesSummary | undefined => {
  if (reviewItems.length === 0) {
    return undefined;
  }

  const reasons: MappingIssuesSummary['reasons'] = [...new Set(reviewItems.map(item => item.reason))];
  return {
    count: reviewItems.length,
    primaryReason: reviewItems[0]!.reason,
    reasons,
  };
};

export function projectMappingIssues(
  input: {
    mappingEntryKind: EffectiveMappingKind;
    providerId: ProviderTargetId | null;
    acceptedEvidence?: AcceptedMappingEvidence;
    recentEvaluation?: RecentMappingEvaluationTrace;
    autoMappingStatus?: AutoMappingStatus;
    exactUpstreamMatchProviderId?: ProviderTargetId | null;
  },
): {
  reviewSummary?: MappingIssuesSummary;
  reviewItems?: readonly MappingIssue[];
} {
  const current = buildReviewState({
    mappingEntryKind: input.mappingEntryKind,
    providerId: input.providerId,
    autoMappingStatus: input.autoMappingStatus,
    acceptedReason: input.acceptedEvidence?.reason,
    immediateSourceAniListId: input.acceptedEvidence?.immediateSourceAniListId,
    chainAnchorAniListId: input.acceptedEvidence?.chainAnchorAniListId,
  });
  const reviewItems: MappingIssue[] = [];

  if (
    input.mappingEntryKind === 'manual' &&
    input.providerId !== null &&
    typeof input.exactUpstreamMatchProviderId === 'number' &&
    input.exactUpstreamMatchProviderId !== input.providerId
  ) {
    reviewItems.push({
      reason: 'manual-upstream-disagreement',
      summary: 'Manual mapping disagrees with exact upstream mapping.',
      current,
      proposed: buildReviewState({
        mappingEntryKind: 'upstream',
        providerId: input.exactUpstreamMatchProviderId,
        autoMappingStatus: 'mapped',
        acceptedReason: 'exact-upstream',
      }),
      actions: ['keep-current', 'use-exact-upstream'],
    });
  }

  if (input.mappingEntryKind === 'ignored' && typeof input.exactUpstreamMatchProviderId === 'number') {
    reviewItems.push({
      reason: 'ignored-but-exact-upstream',
      summary: 'Ignored title now has an exact upstream mapping available.',
      current,
      proposed: buildReviewState({
        mappingEntryKind: 'upstream',
        providerId: input.exactUpstreamMatchProviderId,
        autoMappingStatus: 'mapped',
        acceptedReason: 'exact-upstream',
      }),
      actions: ['keep-current', 'clear-ignore'],
    });
  }

  const inheritedCandidates = getInheritedCandidates(input.recentEvaluation);

  if (input.autoMappingStatus === 'verification-failed' && inheritedCandidates.length > 0) {
    const candidate = inheritedCandidates[0]!;
    reviewItems.push({
      reason: 'verification-failed-inherited-candidate',
      summary: 'Inherited candidate could not be operationally verified.',
      current,
      proposed: buildReviewState({
        mappingEntryKind: 'auto',
        providerId: candidate.providerId,
        acceptedReason: 'verified-inherited',
        immediateSourceAniListId: candidate.immediateSourceAniListId,
        chainAnchorAniListId: candidate.chainAnchorAniListId,
      }),
      actions: ['retry-resolution', 'set-manual-mapping'],
    });
  }

  if (input.autoMappingStatus === 'ambiguous' && inheritedCandidates.length > 1) {
    reviewItems.push({
      reason: 'ambiguous-inherited-conflict',
      summary: 'Inherited relation anchors proposed conflicting provider IDs.',
      current,
      conflicts: inheritedCandidates.map(candidate => buildReviewState({
        mappingEntryKind: 'auto',
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
