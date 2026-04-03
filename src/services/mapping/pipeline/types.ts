/** Mapping pipeline types for AniList evaluation and provider lookup context. */
// src/services/mapping/pipeline/types.ts

import type { SearchTerm } from './search-term-generator';
import type { ProviderLookupResult } from '../lookup';

export interface ScoredCandidate<TResult extends ProviderLookupResult = ProviderLookupResult>
{
  term: SearchTerm;
  result: TResult;
  /**
   * Confidence score in range [0, 1].
   */
  score: number;
  breakdown?: Record<string, number>;
}

export type EvaluationOutcome =
  | {
    status: 'resolved';
    externalId: number;
    confidence: number;
    successfulSynonym?: string;
  }
  | {
    status: 'unresolved';
    reason: string;
  };

export {type AniListMedia} from '@/shared/schemas/anilist/anilist-media.schema';
