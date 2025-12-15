import type { AnilistApiService } from '@/api/anilist.api';
import type { SonarrLookupClient, SonarrLookupCredentials } from '@/services/mapping/sonarr-lookup.client';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type { SearchTerm } from '@/services/mapping/pipeline/search-term-generator';
import type { SonarrLookupSeries } from './sonarr';
import type { ScopedLogger } from '@/shared/utils/logger';
import type { AniMedia } from './anilist';
import type { RequestPriority } from './common';

export type MappingSource = 'manual' | 'upstream' | 'auto' | 'ignored';
export type MappingStatus = 'unmapped' | 'in-provider' | 'not-in-provider';
export type MappingProvider = 'sonarr' | 'radarr';

export interface MappingExternalId {
  id: number;
  kind: 'tvdb' | 'tmdb';
}

export interface MappingSummary {
  anilistId: number;
  provider: MappingProvider;
  externalId: MappingExternalId | null;
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
  hadResolveAttempt?: boolean;
}

export interface Candidate {
  term: SearchTerm;
  result: SonarrLookupSeries;
}

export interface ScoredCandidate extends Candidate {
  /**
   * Confidence score in range [0, 1].
   */
  score: number;
  breakdown?: Record<string, number>;
}

export interface EvaluationOutcomeResolved {
  status: 'resolved';
  tvdbId: number;
  confidence: number;
  successfulSynonym?: string;
}

export interface EvaluationOutcomeUnresolved {
  status: 'unresolved';
  reason: string;
}

export type EvaluationOutcome = EvaluationOutcomeResolved | EvaluationOutcomeUnresolved;

export interface MappingContext {
  anilistApi: AnilistApiService;
  lookupClient: SonarrLookupClient;
  staticProvider: StaticMappingProvider;
  credentials: SonarrLookupCredentials;
  /** Priority hint for Sonarr lookups spawned by this context. */
  priority?: RequestPriority;
  /** If true, bypass fresh lookup caches and hit the network. */
  forceLookupNetwork?: boolean;
  sessionSeenCanonical: Set<string>;
  limits: {
    maxTerms: number;
    scoreThreshold: number;
    earlyStopThreshold: number;
  };
  log: ScopedLogger;
}

export type { AniMedia };

export interface MappingOverrideRecord {
  anilistId: number;
  tvdbId: number;
  updatedAt: number;
}

export interface MappingIgnoreRecord {
  anilistId: number;
  updatedAt: number;
}
