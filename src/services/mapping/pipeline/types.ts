import type { SearchTerm } from './search-term-generator';
import type { SonarrLookupClient, SonarrLookupCredentials } from '../sonarr-lookup.client';
import type { StaticMappingProvider } from '../static-mapping.provider';
import type { ScopedLogger } from '@/shared/utils/logger';
import type { AniMedia, RequestPriority, SonarrLookupSeries } from '@/shared/types';
import type { AnilistApiService } from '@/clients/anilist.api';

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
