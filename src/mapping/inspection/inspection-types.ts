/** Mapping-owned inspection payload types for inspect-and-fix detail reads. */
// src/mapping/inspection/inspection-types.ts

import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';
import type { Provider } from '@/providers';
import type {
  MappingAcceptedEvidence,
  MappingAcceptedReason,
  MappingAcceptedSource,
  MappingEvaluationCandidateStatus,
  MappingInheritedVerificationDetails,
  MappingLibraryStatus,
  MappingResolverState,
  MappingStatus,
  MappingSuppressionKind,
} from '@/mapping/types';
import type {
  MappingReviewItem,
  MappingReviewReason,
  MappingReviewSummary,
} from '@/mapping/review/review-types';

export interface MappingInspectionLibrarySummary {
  status: MappingLibraryStatus;
  title?: string;
  type?: 'series' | 'movie';
  statusLabel?: string;
  inLibraryCount?: number;
}

export interface MappingInspectionEffectiveMapping {
  provider: Provider;
  anilistId: number;
  providerId: number | null;
  suppressedProviderId?: number | null;
  status: MappingStatus;
  libraryStatus: MappingLibraryStatus;
  effectiveSource?: MappingAcceptedSource;
  effectiveReason?: MappingAcceptedReason;
  resolverOutcome?: MappingResolverState;
  suppressionKind?: MappingSuppressionKind;
  hadResolveAttempt?: boolean;
  evidence?: MappingAcceptedEvidence;
  library?: MappingInspectionLibrarySummary;
}

export interface MappingInspectionLinkedAniListEntry {
  anilistId: number;
  title?: string;
  format?: AniListMediaFormat | null;
  year?: number | null;
  relation?: 'current';
}

export interface MappingInspectionExplanationItem {
  kind: 'effective-source' | 'suppression' | 'resolver-outcome' | 'review';
  summary: string;
  source?: MappingAcceptedSource;
  reason?: MappingAcceptedReason;
  resolverOutcome?: MappingResolverState;
  reviewReason?: MappingReviewReason;
  suppressedProviderId?: number;
  immediateSourceAniListId?: number;
  chainAnchorAniListId?: number;
  details?: readonly string[];
}

export interface MappingInspectionCandidate {
  providerId: number;
  title?: string;
  source: MappingAcceptedSource;
  reason: MappingAcceptedReason;
  status: MappingEvaluationCandidateStatus;
  summary: string;
  score?: number;
  inheritedVerification?: MappingInheritedVerificationDetails;
}

export interface MappingInspectionSuggestedCandidates {
  attemptedAt?: number;
  searchTerms?: readonly string[];
  accepted: readonly MappingInspectionCandidate[];
  rejected: readonly MappingInspectionCandidate[];
  suppressed: readonly MappingInspectionCandidate[];
  notAccepted: readonly MappingInspectionCandidate[];
}

export interface MappingInspectionReviewDetail {
  needsReview: boolean;
  summary?: MappingReviewSummary;
  items?: readonly MappingReviewItem[];
}

export interface MappingInspectionProviderContext {
  provider: Provider;
  providerId: number | null;
  linkedAniListIds: readonly number[];
  linkedAniListCount: number;
}

export interface MappingInspectionPayload {
  effectiveMapping: MappingInspectionEffectiveMapping;
  providerContext: MappingInspectionProviderContext;
  linkedAniListEntries: readonly MappingInspectionLinkedAniListEntry[];
  whyThisExists: readonly MappingInspectionExplanationItem[];
  suggestedCandidates: MappingInspectionSuggestedCandidates;
  review: MappingInspectionReviewDetail;
}
