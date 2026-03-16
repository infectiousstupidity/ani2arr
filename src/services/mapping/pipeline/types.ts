import type { SearchTerm } from './search-term-generator';
import type { StaticMappingProvider } from '../static-mapping.provider';
import type { ScopedLogger } from '@/shared/utils/logger';
import type { AniMedia, RequestPriority } from '@/shared/types';
import type { AnilistApiService } from '@/clients/anilist.api';
import type {
  LookupClientCredentials,
  ProviderLookupClient,
  ProviderLookupResult,
} from '../provider-lookup.client';

export interface Candidate<TResult extends ProviderLookupResult = ProviderLookupResult> {
  term: SearchTerm;
  result: TResult;
}

export interface ScoredCandidate<TResult extends ProviderLookupResult = ProviderLookupResult>
  extends Candidate<TResult> {
  /**
   * Confidence score in range [0, 1].
   */
  score: number;
  breakdown?: Record<string, number>;
}

export interface EvaluationOutcomeResolved {
  status: 'resolved';
  externalId: number;
  confidence: number;
  successfulSynonym?: string;
}

export interface EvaluationOutcomeUnresolved {
  status: 'unresolved';
  reason: string;
}

export type EvaluationOutcome = EvaluationOutcomeResolved | EvaluationOutcomeUnresolved;

export interface MappingContext<
  TResult extends ProviderLookupResult = ProviderLookupResult,
  TCredentials = LookupClientCredentials,
> {
  anilistApi: AnilistApiService;
  lookupClient: ProviderLookupClient<TCredentials, TResult>;
  staticProvider: StaticMappingProvider;
  credentials: TCredentials;
  /** Priority hint for provider lookups spawned by this context. */
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
