/** Mapping service input and output types for AniList-driven resolution flows. */
// src/mapping/types.ts

import type { AniListId } from '@/anilist';
import type { Provider, ProviderIdentity, ProviderTargetId } from '@/providers';

/** Derived entry kinds used by review/filter/table surfaces. */
export const MAPPING_ENTRY_KIND_VALUES = [
  'manual',
  'upstream',
  'auto',
  'ignored',
  'rejected',
  'unmapped',
  'unknown',
] as const;

export type MappingEntryKind = (typeof MAPPING_ENTRY_KIND_VALUES)[number];

/** Canonical mapping-resolution truth for one provider + AniList entry. */
export type ProviderMappingState = 'mapped' | 'unmapped' | 'unknown';

/** Semantic reason why mapping state is unknown. */
export type MappingUnknownReason =
  | 'provider-not-configured'
  | 'network-disabled'
  | 'lookup-failed'
  | 'ambiguous'
  | 'verification-failed';

/**
 * Source of an accepted mapping.
 *
 * This describes how the currently effective mapping became accepted.
 *
 * - `manual`: user-created exact manual mapping
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
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
}

/** Small accepted-evidence payload for explaining why one mapping is effective. */
export interface MappingAcceptedEvidence {
  source: MappingAcceptedSource;
  reason: MappingAcceptedReason;
  successfulTitle?: string;
  immediateSourceAniListId?: AniListId;
  chainAnchorAniListId?: AniListId;
  inheritedVerification?: MappingInheritedVerificationDetails;
}

/** Candidate disposition recorded in the most recent resolver evaluation trace. */
export type MappingEvaluationCandidateStatus = 'accepted' | 'rejected' | 'suppressed' | 'not-accepted';

/** Compact candidate explanation kept in the most recent evaluation trace only. */
export interface MappingEvaluationCandidate {
  providerId: ProviderTargetId;
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
 * User-owned suppression kind for the effective row state.
 */
export type MappingSuppressionKind = 'ignored-entry' | 'rejected-candidate';

/** Canonical mapping identity for one `provider + anilistId`. */
export interface MappingIdentity {
  anilistId: AniListId;
  provider: Provider;
  providerId: ProviderTargetId | null;
  providerMappingState: ProviderMappingState;
  mappingEntryKind: MappingEntryKind;
  mappingSource?: MappingAcceptedSource;
  mappingReason?: MappingAcceptedReason;
}

/** Persisted manual mapping or rejected candidate record keyed by provider and AniList entry. */
export type MappingProviderIdRecord = ProviderIdentity & {
  anilistId: AniListId;
  updatedAt: number;
};

/** Persisted ignore record for one provider and AniList entry. */
export interface MappingIgnoreRecord {
  anilistId: AniListId;
  provider: Provider;
  updatedAt: number;
}
