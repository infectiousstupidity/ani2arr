/** Auto-mapping resolver result and persistence types. */
// src/mapping/auto-mapping/types.ts

import type { AniListId } from '@/anilist';
import type { AniListMediaHint } from '@/anilist/schemas/media.schema';
import type { ProviderTargetId } from '@/providers';
import type { RequestPriority } from '@/shared/utils/request-priority';
import type {
  MappingAcceptedEvidence,
  MappingAcceptedReason,
  MappingAcceptedSource,
  MappingInheritedVerificationDetails,
  MappingRecentEvaluationTrace,
} from '@/mapping/types';

/**
 * Source of an automated resolver result.
 *
 * This is a narrower version of `MappingAcceptedSource` that intentionally excludes
 * `manual`, because manual mappings are user-owned, not resolver-produced
 * candidates or resolver-accepted results.
 */
export type AutoMappingSource = Exclude<MappingAcceptedSource, 'manual'>;

/**
 * Final semantic result of trying to auto-map one `provider + anilistId`.
 *
 * Important:
 * - `unresolved` = no acceptable answer
 * - `ambiguous` = too many plausible answers
 * - `verification-failed` = plausible answer exists, but verification could not be completed
 */
export type AutoMappingStatus =
  | 'mapped'
  | 'unresolved'
  | 'ambiguous'
  | 'verification-failed';

/** Successful auto-mapping result returned by the resolver. */
export interface AcceptedAutoMapping {
  providerId: ProviderTargetId;
  reason: MappingAcceptedReason;
  successfulSynonym?: string;
  recentEvaluation?: MappingRecentEvaluationTrace;
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
  inheritedVerification?: MappingInheritedVerificationDetails;
}

/**
 * Persisted or cached semantic auto-mapping outcome for one `provider + anilistId`.
 *
 * Important distinction:
 * - `acceptedEvidence` is only used for successful mapped outcomes
 * - `recentEvaluation` is the rebuildable explanation cache for the latest attempt
 */
export type AutoMappingRecord =
  | {
      state: 'mapped';
      providerId: ProviderTargetId;
      acceptedEvidence: MappingAcceptedEvidence;
      recentEvaluation?: MappingRecentEvaluationTrace;
      updatedAt: number;
    }
  | {
      state: Exclude<AutoMappingStatus, 'mapped'>;
      recentEvaluation?: MappingRecentEvaluationTrace;
      updatedAt: number;
    };

/**
 * Options that influence provider-id resolution for one AniList entry.
 *
 * These control network usage, hinting, and lookup freshness, but do not change the
 * semantic meaning of resolver outcomes.
 */
export interface AutoMappingOptions {
  network?: 'never';
  hints?: {
    primaryTitle?: string;
    domMedia?: AniListMediaHint | null;
  };
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
  /** Force provider lookups to bypass fresh caches, used by anime-detail force-verify flows. */
  forceLookupNetwork?: boolean;
}
