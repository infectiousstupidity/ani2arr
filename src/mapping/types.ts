/** Mapping service input and output types for AniList-driven resolution flows. */
// src/mapping/types.ts

import type { AniListMediaHint } from '@/anilist/schemas/media.schema';
import type { Provider } from '@/providers';
import type { RequestPriority } from '@/shared/utils/request-priority';

/**
 * Legacy row/source classification still used by existing listing and filtering callers.
 *
 * This is broader and less precise than the newer accepted/candidate fields:
 * - `manual`, `upstream`, `auto` describe effective mapped rows
 * - `rejected`, `ignored` describe user-owned suppression rows
 * - `unresolved` describes rows where resolution was attempted but nothing was accepted
 *
 * Prefer `acceptedEvidence`, `recentEvaluation`, and `resolverState` when you need
 * precise backend semantics.
 */
export type MappingSource = 'manual' | 'upstream' | 'auto' | 'rejected' | 'ignored' | 'unresolved';

/**
 * Library-facing status for the effective mapping row.
 *
 * - `unmapped`: no effective providerId is currently active for the row
 * - `in-provider`: the effective providerId exists in the provider library
 * - `not-in-provider`: the effective providerId is known, but is not in the provider library
 */
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';

/**
 * Source of an accepted mapping.
 *
 * This describes how the currently effective mapping became accepted.
 *
 * - `manual`: user-created exact override
 * - `upstream`: exact upstream mapping
 * - `auto`: resolver-accepted mapping from automated logic such as lookup,
 *   verified inheritance, or fallback matching
 */
export type MappingAcceptedSource = 'manual' | 'upstream' | 'auto';

/**
 * Reason an accepted mapping was accepted.
 *
 * This is intentionally separate from source.
 * Source answers "where did it come from?"
 * Reason answers "why was it accepted?"
 *
 * Examples:
 * - `source: 'upstream'` + `reason: 'exact-upstream'`
 * - `source: 'manual'` + `reason: 'manual-override'`
 * - `source: 'auto'` + `reason: 'verified-inherited'`
 * - `source: 'auto'` + `reason: 'fuzzy-match'`
 */
export type MappingAcceptedReason =
  | 'exact-upstream'
  | 'manual-override'
  | 'exact-title-match'
  | 'verified-inherited'
  | 'fuzzy-match'
  | 'borrowed-base-title-fallback';

/** Structured inherited-verification details kept with accepted or recent evaluation data. */
export interface MappingInheritedVerificationDetails {
  reason: string;
  positiveSignals: readonly string[];
  contradictions: readonly string[];
  immediateSourceAniListId?: number;
  chainAnchorAniListId?: number;
}

/**
 * Source of an automated resolver result.
 *
 * This is a narrower version of `MappingAcceptedSource` that intentionally excludes
 * `manual`, because manual mappings are user-owned overrides, not resolver-produced
 * candidates or resolver-accepted results.
 *
 * Use this type for resolver-owned fields such as:
 * - accepted automated results
 * - candidate results that the resolver proposed before final acceptance
 *
 * Do not use this for user overrides. Manual overrides should use
 * `MappingAcceptedSource` via `acceptedEvidence.source`.
 */
export type MappingResolvedSource = Exclude<MappingAcceptedSource, 'manual'>;

/** Small accepted-evidence payload for explaining why one mapping is effective. */
export interface MappingAcceptedEvidence {
  source: MappingAcceptedSource;
  reason: MappingAcceptedReason;
  successfulTitle?: string;
  immediateSourceAniListId?: number;
  chainAnchorAniListId?: number;
  inheritedVerification?: MappingInheritedVerificationDetails;
}

/** Candidate disposition recorded in the most recent resolver evaluation trace. */
export type MappingEvaluationCandidateStatus = 'accepted' | 'rejected' | 'suppressed' | 'not-accepted';

/** Compact candidate explanation kept in the most recent evaluation trace only. */
export interface MappingEvaluationCandidate {
  providerId: number;
  title?: string;
  source: MappingAcceptedSource;
  reason: MappingAcceptedReason;
  status: MappingEvaluationCandidateStatus;
  summary: string;
  score?: number;
  inheritedVerification?: MappingInheritedVerificationDetails;
}

/** Small, rebuildable trace of the most recent resolver evaluation attempt. */
export interface MappingRecentEvaluationTrace {
  attemptedAt: number;
  searchTerms?: readonly string[];
  candidates: readonly MappingEvaluationCandidate[];
}

/**
 * Conflict type projected from current effective state and exact upstream truth.
 *
 * These conflicts do not necessarily change the current effective mapping.
 * They explain why a row may need review.
 */
export type MappingConflictKind = 'manual-upstream-conflict' | 'ignore-upstream-conflict';

/**
 * User-owned suppression kind for a specific rejected candidate.
 *
 * This is intentionally candidate-scoped, not a blanket veto for the whole row.
 */
export type MappingSuppressionKind = 'rejected-candidate';

/**
 * Final semantic result of trying to resolve one `provider + anilistId`.
 *
 * Decision rules:
 * - `mapped`:
 *   a candidate `providerId` was accepted.
 *
 * - `unresolved`:
 *   resolution was attempted, but there was no acceptable candidate to take forward.
 *   This is used when the result is effectively "nothing good enough was found".
 *   Examples:
 *   - no search results
 *   - only weak fuzzy matches
 *   - inherited candidate was rejected, fallback ran, and nothing else was accepted
 *
 * - `ambiguous`:
 *   there are one or more plausible candidates, but the resolver cannot choose a single
 *   correct one with confidence.
 *   This is used when the result is "there may be a match, but it is unclear which one".
 *   Examples:
 *   - two inherited anchors point to different provider IDs
 *   - verifier finds no hard contradiction, but not enough positive evidence to accept
 *   - multiple strong candidates remain materially tied
 *
 * - `verification-failed`:
 *   the resolver had a strong candidate it wanted to verify, but could not complete the
 *   verification step due to an operational problem.
 *   This is used when the result is "this might be correct, but verification could not be completed".
 *   Examples:
 *   - exact provider lookup needed for verification failed due to network/API error
 *   - provider returned unusable verification data for a strong inherited candidate
 *
 * Important:
 * - `unresolved` = no acceptable answer
 * - `ambiguous` = too many plausible answers
 * - `verification-failed` = plausible answer exists, but verification could not be completed
 */
export type MappingResolverState =
  | 'mapped'
  | 'unresolved'
  | 'ambiguous'
  | 'verification-failed';

/**
 * Review projection for the effective mapping state of one `provider + anilistId`.
 *
 * Field groups:
 * - `source`:
 *   legacy row classification kept for existing callers
 *
 * - `acceptedEvidence`:
 *   explains why the effective mapping exists when the row is currently mapped
 *
 * - `recentEvaluation`:
 *   compact trace of the most recent resolver attempt for inspect and suggestion UIs
 *
 * - `resolverState`:
 *   carries the semantic resolver outcome without overloading `source`
 */
export interface MappingSummary {
  anilistId: number;
  provider: Provider;
  providerId: number | null;
  suppressedProviderId?: number | null;
  source: MappingSource;
  acceptedEvidence?: MappingAcceptedEvidence;
  recentEvaluation?: MappingRecentEvaluationTrace;

  suppressionKind?: MappingSuppressionKind;
  exactUpstreamProviderId?: number | null;
  conflictKind?: MappingConflictKind;
  status: MappingStatus;
  updatedAt?: number;
  linkedAniListIds?: readonly number[];
  inLibraryCount?: number;
  providerMeta?: {
    title?: string;
    type?: 'series' | 'movie';
    statusLabel?: string;
  };
  resolverState?: MappingResolverState;
  hadResolveAttempt?: boolean;
}

/** Persisted manual mapping or rejected candidate record keyed by provider and AniList entry. */
export interface MappingProviderIdRecord {
  anilistId: number;
  provider: Provider;
  providerId: number;
  updatedAt: number;
}

/** Persisted ignore record for one provider and AniList entry. */
export interface MappingIgnoreRecord {
  anilistId: number;
  provider: Provider;
  updatedAt: number;
}

/**
 * Accepted mapping result returned by the resolver.
 *
 * This represents a successful accepted mapping only.
 * Non-accepted semantic outcomes are represented by `MappingResolverState` and
 * `ResolverStateRecord`, not by this type.
 */
export interface ResolvedMapping {
  providerId: number;
  reason: MappingAcceptedReason;
  successfulSynonym?: string;
  recentEvaluation?: MappingRecentEvaluationTrace;
  immediateSourceAniListId?: number;
  chainAnchorAniListId?: number;
  inheritedVerification?: MappingInheritedVerificationDetails;
}

/**
 * Persisted or cached semantic resolver state for one `provider + anilistId`.
 *
 * Important distinction:
 * - `acceptedEvidence` is only used for successful mapped outcomes
 * - `recentEvaluation` is the rebuildable explanation cache for the latest attempt
 */
export type ResolverStateRecord =
  /**
   * Resolver accepted a final mapping.
   *
   * `acceptedEvidence` describes the effective accepted result.
   */
  | {
      state: 'mapped';
      providerId: number;
      acceptedEvidence: MappingAcceptedEvidence;
      recentEvaluation?: MappingRecentEvaluationTrace;
      updatedAt: number;
    }

  /**
   * Resolver completed without an accepted mapping.
   *
   * - `unresolved`: nothing acceptable was found
   * - `ambiguous`: more than one plausible answer remained
   * - `verification-failed`: a plausible candidate existed, but final verification failed
   */
  | {
      state: 'unresolved' | 'ambiguous' | 'verification-failed';
      recentEvaluation?: MappingRecentEvaluationTrace;
      updatedAt: number;
    };

/**
 * Options that influence provider-id resolution for one AniList entry.
 *
 * These control network usage, hinting, and lookup freshness, but do not change the
 * semantic meaning of resolver outcomes.
 */
export interface ResolveProviderIdOptions {
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
