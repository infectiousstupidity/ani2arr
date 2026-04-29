/** UI/list read-model types for projected mapping rows. */
// src/mapping/ui/mapping-list-types.ts

import type { AniListId } from '@/anilist';
import type { ProviderTargetId } from '@/providers';
import type { AutoMappingStatus } from '@/mapping/auto-mapping/types';
import type {
  MappingIdentity,
  MappingSuppressionKind,
  MappingUnknownReason,
} from '@/mapping/types';
import type { MappingReviewItem, MappingReviewSummary } from '@/mapping/review/review-types';
import type { LibraryUnknownReason } from '@/providers/library/types';

/** Primary user-facing status for one projected mapping summary row. */
export type MappingRowStatus =
  | 'needs-review'
  | 'in-library'
  | 'can-add'
  | 'suppressed'
  | 'unmapped'
  | 'unknown';

/**
 * Enriched options-page/RPC summary row for one `provider + anilistId`.
 */
export interface MappingSummary extends MappingIdentity {
  isInLibrary: boolean | null;
  suppressedProviderId?: ProviderTargetId | null;
  mappingRowStatus: MappingRowStatus;
  suppressionKind?: MappingSuppressionKind;
  reviewSummary?: MappingReviewSummary;
  reviewItems?: readonly MappingReviewItem[];
  updatedAt?: number;
  linkedAniListIds?: readonly AniListId[];
  inLibraryCount?: number;
  providerMeta?: {
    title?: string;
    type?: 'series' | 'movie';
    statusLabel?: string;
  };
  resolverOutcome?: AutoMappingStatus;
  mappingUnknownReason?: MappingUnknownReason;
  libraryUnknownReason?: LibraryUnknownReason;
  hadResolveAttempt?: boolean;
}
