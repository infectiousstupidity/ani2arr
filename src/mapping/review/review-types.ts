/** Mapping-owned review projection types for backend conflict and follow-up state. */
// src/mapping/review/review-types.ts

import type { AniListId } from '@/anilist';
import type { ProviderTargetId } from '@/providers';
import type {
  MappingAcceptedReason,
  MappingEntryKind,
} from '@/mapping/types';
import type { AutoMappingStatus } from '@/mapping/auto-mapping/types';

export type MappingReviewReason =
  | 'manual-upstream-disagreement'
  | 'ignored-but-exact-upstream'
  | 'verification-failed-inherited-candidate'
  | 'ambiguous-inherited-conflict';

export type MappingReviewAction =
  | 'keep-current'
  | 'use-exact-upstream'
  | 'clear-ignore'
  | 'retry-resolution'
  | 'inspect-candidates'
  | 'set-manual-mapping';

export interface MappingReviewState {
  mappingEntryKind: MappingEntryKind;
  providerId: ProviderTargetId | null;
  resolverState?: AutoMappingStatus;
  acceptedReason?: MappingAcceptedReason;
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
}

export interface MappingReviewItem {
  reason: MappingReviewReason;
  summary: string;
  current: MappingReviewState;
  proposed?: MappingReviewState;
  conflicts?: readonly MappingReviewState[];
  actions: readonly MappingReviewAction[];
}

export interface MappingReviewSummary {
  count: number;
  primaryReason: MappingReviewReason;
  reasons: readonly MappingReviewReason[];
}
