// src/services/mapping/types.ts
import type { AniMedia, AnilistApiService } from '@/api/anilist.api';
import type { SonarrLookupSeries } from '@/types';
import type { SonarrLookupClient, SonarrLookupCredentials } from './sonarr-lookup.client';
import type { StaticMappingProvider } from './static-mapping.provider';
import type { ScopedLogger } from '@/utils/logger';
import type { SearchTerm } from './search-term-generator';

export interface Candidate {
  term: SearchTerm;
  result: SonarrLookupSeries;
}

export interface ScoredCandidate extends Candidate {
  score: number; // 0..1
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
