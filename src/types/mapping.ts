import type { AnilistApiService } from '@/api/anilist.api';
import type { SonarrLookupClient, SonarrLookupCredentials } from '@/services/mapping/sonarr-lookup.client';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type { SearchTerm } from '@/services/mapping/search-term-generator';
import type { SonarrLookupSeries } from './sonarr';
import type { ScopedLogger } from '@/utils/logger';
import type { AniMedia } from './anilist';

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
  sessionSeenCanonical: Set<string>;
  limits: {
    maxTerms: number;
    scoreThreshold: number;
    earlyStopThreshold: number;
  };
  log: ScopedLogger;
}

export type { AniMedia };
