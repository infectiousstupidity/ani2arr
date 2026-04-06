/** Mapping service input and output types for AniList-driven resolution flows. */
// src/mapping/types.ts

import type { AniListMediaHint } from '@/anilist/schemas/media.schema';
import type { Provider } from '@/providers';
import type { RequestPriority } from '@/shared/utils/request-priority';

export type MappingSource = 'manual' | 'upstream' | 'auto' | 'rejected' | 'ignored' | 'unresolved';
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';

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
 * Source of an accepted mapped result.
 *
 * Only valid when `state === 'mapped'`.
 *
 * - `auto`: accepted by the resolver from lookup / inheritance / fallback logic
 * - `upstream`: accepted from an exact upstream mapping
 */
export type MappingResolvedSource = 'auto' | 'upstream';

export interface MappingSummary {
  anilistId: number;
  provider: Provider;
  providerId: number | null;
  suppressedProviderId?: number | null;
  source: MappingSource;
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

export interface MappingProviderIdRecord {
  anilistId: number;
  provider: Provider;
  providerId: number;
  updatedAt: number;
}

export interface MappingIgnoreRecord {
  anilistId: number;
  provider: Provider;
  updatedAt: number;
}

export interface ResolvedMapping {
  providerId: number;
  successfulSynonym?: string;
}

export type ResolverStateRecord =
  | {
      state: 'mapped';
      providerId: number;
      source: MappingResolvedSource;
      successfulSynonym?: string;
      updatedAt: number;
    }
  | {
      state: 'unresolved' | 'ambiguous';
      title?: string;
      updatedAt: number;
    }
  | {
      state: 'verification-failed';
      providerId: number;
      source: MappingResolvedSource;
      title?: string;
      successfulSynonym?: string;
      updatedAt: number;
    };

export interface ResolveProviderIdOptions {
  network?: 'never';
  hints?: {
    primaryTitle?: string;
    domMedia?: AniListMediaHint | null;
  };
  ignoreFailureCache?: boolean;
  priority?: RequestPriority;
  // Force provider lookups to bypass fresh caches (used by anime detail force-verify).
  forceLookupNetwork?: boolean;
}
