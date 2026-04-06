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
 * Prefer `acceptedSource`, `acceptedReason`, and `resolverState` when you need
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
 * - `source: 'upstream'` + `reason: 'exact'`
 * - `source: 'auto'` + `reason: 'relation'`
 * - `source: 'auto'` + `reason: 'fuzzy'`
 */
export type MappingAcceptedReason = 'exact' | 'relation' | 'title' | 'fuzzy';

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
 * `MappingAcceptedSource` and appear as `acceptedSource: 'manual'`.
 */
export type MappingResolvedSource = Exclude<MappingAcceptedSource, 'manual'>;

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
 * - `acceptedSource` / `acceptedReason`:
 *   describe the currently effective accepted mapping and are only meaningful when
 *   the row has an accepted mapping, typically alongside `resolverState: 'mapped'`
 *   or a manual effective state
 *
 * - `candidateSource` / `candidateReason`:
 *   describe a resolver-proposed candidate that was strong enough to matter, but did
 *   not become the effective accepted mapping
 *   this is mainly useful for states like `verification-failed`, where the resolver
 *   had a concrete candidate but could not complete verification
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

  /**
   * Source of the currently effective accepted mapping.
   *
   * Populated when this row has an accepted effective mapping.
   * Examples:
   * - manual override row -> `manual`
   * - exact upstream row -> `upstream`
   * - resolver-accepted row -> `auto`
   *
   * Not used for unresolved-style outcomes.
   */
  acceptedSource?: MappingAcceptedSource;

  /**
   * Reason the currently effective mapping was accepted.
   *
   * Populated together with `acceptedSource` when this row has an accepted mapping.
   * This explains why the effective mapping was accepted, not merely where it came from.
   */
  acceptedReason?: MappingAcceptedReason;

  /**
   * Source of a concrete resolver candidate that mattered, but did not become the
   * current effective accepted mapping.
   *
   * This is mainly used for proposed automated candidates, such as a candidate that
   * reached verification and then ended in `verification-failed`.
   *
   * Because this field is resolver-owned, it intentionally excludes `manual`.
   */
  candidateSource?: MappingResolvedSource;

  /**
   * Reason associated with `candidateSource`.
   *
   * This explains why the resolver considered that candidate plausible enough to carry
   * forward, even though it did not become the effective accepted mapping.
   *
   * Typical use:
   * - `resolverState: 'verification-failed'`
   * - `candidateSource: 'auto'`
   * - `candidateReason: 'relation'`
   */
  candidateReason?: MappingAcceptedReason;

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
}

/**
 * Persisted or cached semantic resolver state for one `provider + anilistId`.
 *
 * Important distinction:
 * - `acceptedSource` / `acceptedReason` are only used for successful mapped outcomes
 * - `candidateSource` / `candidateReason` are used when the resolver had a concrete
 *   candidate but could not turn it into an accepted mapping
 */
export type ResolverStateRecord =
  /**
   * Resolver accepted a final mapping.
   *
   * `acceptedSource` / `acceptedReason` describe the effective accepted result.
   * There is no candidate-only field here because the candidate became the accepted mapping.
   */
  | {
      state: 'mapped';
      providerId: number;
      acceptedSource: MappingResolvedSource;
      acceptedReason: MappingAcceptedReason;
      successfulSynonym?: string;
      updatedAt: number;
    }

  /**
   * Resolver completed without an accepted mapping and without a concrete candidate
   * that needs separate candidate metadata.
   *
   * - `unresolved`: nothing acceptable was found
   * - `ambiguous`: more than one plausible answer remained
   */
  | {
      state: 'unresolved' | 'ambiguous';
      title?: string;
      updatedAt: number;
    }

  /**
   * Resolver had a concrete candidate it wanted to verify, but verification could not
   * be completed.
   *
   * `candidateSource` / `candidateReason` describe that proposed, not-finally-accepted
   * candidate. They are not accepted fields because the mapping did not become effective.
   */
  | {
      state: 'verification-failed';
      providerId: number;
      candidateSource: MappingResolvedSource;
      candidateReason: MappingAcceptedReason;
      title?: string;
      successfulSynonym?: string;
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
