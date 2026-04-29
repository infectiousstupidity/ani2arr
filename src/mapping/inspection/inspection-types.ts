/** Mapping-owned inspection payload types for inspect-and-fix detail reads. */
// src/mapping/inspection/inspection-types.ts

import type { AniListId } from '@/anilist';
import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';
import type { Provider, ProviderTargetId } from '@/providers';
import type {
  MappingAcceptedEvidence,
  MappingAcceptedReason,
  MappingAcceptedSource,
  MappingEvaluationCandidateStatus,
  MappingInheritedVerificationDetails,
  MappingEntryKind,
  MappingUnknownReason,
  ProviderMappingState,
  MappingSuppressionKind,
} from '@/mapping/types';
import type { MappingRowStatus } from '@/mapping/ui/mapping-list-types';
import type { AutoMappingStatus } from '@/mapping/auto-mapping/types';
import type { LibraryUnknownReason } from '@/providers/library/types';
import type {
  MappingReviewItem,
  MappingReviewReason,
  MappingReviewSummary,
} from '@/mapping/review/review-types';

export interface MappingInspectionLibrarySummary {
  isInLibrary: boolean | null;
  title?: string;
  type?: 'series' | 'movie';
  statusLabel?: string;
  inLibraryCount?: number;
  libraryUnknownReason?: LibraryUnknownReason;
}

export interface MappingInspectionEffectiveMapping {
  provider: Provider;
  anilistId: AniListId;
  providerId: ProviderTargetId | null;
  providerMappingState: ProviderMappingState;
  isInLibrary: boolean | null;
  suppressedProviderId?: ProviderTargetId | null;
  mappingRowStatus: MappingRowStatus;
  mappingEntryKind: MappingEntryKind;
  mappingSource?: MappingAcceptedSource;
  mappingReason?: MappingAcceptedReason;
  resolverOutcome?: AutoMappingStatus;
  suppressionKind?: MappingSuppressionKind;
  mappingUnknownReason?: MappingUnknownReason;
  libraryUnknownReason?: LibraryUnknownReason;
  hadResolveAttempt?: boolean;
  evidence?: MappingAcceptedEvidence;
  library?: MappingInspectionLibrarySummary;
}

export interface MappingInspectionLinkedAniListEntry {
  anilistId: AniListId;
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
  resolverOutcome?: AutoMappingStatus;
  reviewReason?: MappingReviewReason;
  suppressedProviderId?: ProviderTargetId;
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
  details?: readonly string[];
}

export interface MappingInspectionCandidate {
  providerId: ProviderTargetId;
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
  providerId: ProviderTargetId | null;
  linkedAniListIds: readonly AniListId[];
  linkedAniListCount: number;
}

export interface MappingInspectionPayload {
  effectiveMapping: MappingInspectionEffectiveMapping;
  providerContext: MappingInspectionProviderContext;
  linkedAniListEntries: readonly MappingInspectionLinkedAniListEntry[];
  whyThisMapping: readonly MappingInspectionExplanationItem[];
  suggestedCandidates: MappingInspectionSuggestedCandidates;
  review: MappingInspectionReviewDetail;
}
