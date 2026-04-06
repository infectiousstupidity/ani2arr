/** Mapping pipeline types for AniList evaluation and provider lookup context. */
// src/mapping/pipeline/types.ts

import type { SearchTerm } from './search-term-generator';
import type { MappingAcceptedReason } from '../types';
import type { ProviderLookupResult } from '../lookup';

export type PipelineMatchReason = Extract<MappingAcceptedReason, 'exact' | 'fuzzy'>;

export interface ScoredCandidate<TResult extends ProviderLookupResult = ProviderLookupResult>
{
  term: SearchTerm;
  result: TResult;
  /**
   * Confidence score in range [0, 1].
   */
  score: number;
  reason: PipelineMatchReason;
  breakdown?: Record<string, number>;
}

export type EvaluationOutcome =
  | {
    status: 'resolved';
    providerId: number;
    reason: MappingAcceptedReason;
    confidence: number;
    successfulSynonym?: string;
  }
  | {
    status: 'unresolved';
    reason: string;
  };

export {type AniListMedia} from '@/anilist/schemas/media.schema';
