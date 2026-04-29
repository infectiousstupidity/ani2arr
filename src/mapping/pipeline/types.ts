/** Mapping pipeline types for AniList evaluation and provider lookup context. */
// src/mapping/pipeline/types.ts

import type { ProviderTargetId } from '@/providers';
import type { SearchTerm } from './search-term-generator';
import type { MappingAcceptedReason } from '../types';
import type { ProviderLookupResult } from '../lookup';

export type PipelineMatchReason = Extract<MappingAcceptedReason, 'exact-title-match' | 'fuzzy-match'>;

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

export interface PipelineEvaluatedCandidate {
  providerId: ProviderTargetId;
  title: string;
  reason: PipelineMatchReason;
  score: number;
  searchTerm: string;
}

export type EvaluationOutcome =
  | {
    status: 'resolved';
    providerId: ProviderTargetId;
    reason: MappingAcceptedReason;
    confidence: number;
    successfulSynonym?: string;
    searchTerms: string[];
    candidates: PipelineEvaluatedCandidate[];
  }
  | {
    status: 'unresolved';
    reason: string;
    searchTerms: string[];
    candidates: PipelineEvaluatedCandidate[];
  };

export {type AniListMedia} from '@/anilist/schemas/media.schema';
