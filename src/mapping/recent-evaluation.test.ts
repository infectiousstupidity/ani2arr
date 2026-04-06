/** Tests for recent mapping-evaluation trace helpers and candidate merging behavior. */
// src/mapping/recent-evaluation.test.ts

import { describe, expect, it } from 'vitest';
import {
  createRecentEvaluationTrace,
  createSingleCandidateTrace,
  mergeRecentEvaluations,
  mergeTraceCandidates,
  rewriteTraceCandidateStatus,
} from './recent-evaluation';

describe('recent-evaluation helpers', () => {
  it('prefers the highest-priority candidate status for the same provider ID', () => {
    const merged = mergeTraceCandidates([
      {
        providerId: 44,
        source: 'auto',
        reason: 'fuzzy-match',
        status: 'not-accepted',
        summary: 'Fuzzy title match not accepted',
        score: 0.99,
      },
      {
        providerId: 44,
        source: 'auto',
        reason: 'fuzzy-match',
        status: 'accepted',
        summary: 'Fuzzy title match',
        score: 0.4,
      },
    ]);

    expect(merged).toEqual([
      expect.objectContaining({
        providerId: 44,
        status: 'accepted',
        summary: 'Fuzzy title match',
      }),
    ]);
  });

  it('merges search terms and deduplicates candidate entries across traces', () => {
    const first = createRecentEvaluationTrace(['First', 'Shared'], [
      {
        providerId: 10,
        source: 'auto',
        reason: 'exact-title-match',
        status: 'not-accepted',
        summary: 'Exact title match not accepted',
        score: 0.6,
      },
    ]);
    const second = createRecentEvaluationTrace(['Shared', 'Second'], [
      {
        providerId: 10,
        source: 'auto',
        reason: 'exact-title-match',
        status: 'rejected',
        summary: 'Exact title match rejected by candidate suppression',
        score: 0.2,
      },
      {
        providerId: 20,
        source: 'auto',
        reason: 'fuzzy-match',
        status: 'not-accepted',
        summary: 'Fuzzy title match not accepted',
        score: 0.8,
      },
    ]);

    const merged = mergeRecentEvaluations(first, second);

    expect(merged).toMatchObject({
      searchTerms: ['First', 'Shared', 'Second'],
      candidates: [
        expect.objectContaining({ providerId: 10, status: 'rejected' }),
        expect.objectContaining({ providerId: 20, status: 'not-accepted' }),
      ],
    });
  });

  it('rewrites accepted trace candidates to rejected with the matching summary text', () => {
    const trace = createSingleCandidateTrace(
      { providerId: 77, reason: 'fuzzy-match' },
      'auto',
      'accepted',
      ['Attack on Titan'],
      'Attack on Titan',
    );

    const rewritten = rewriteTraceCandidateStatus(trace, 77, 'rejected');

    expect(rewritten).toMatchObject({
      searchTerms: ['Attack on Titan'],
      candidates: [
        expect.objectContaining({
          providerId: 77,
          status: 'rejected',
          summary: 'Fuzzy title match rejected by candidate suppression',
        }),
      ],
    });
  });
});
