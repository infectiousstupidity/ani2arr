/** Pure helpers for recent mapping-evaluation traces and candidate summaries. */
// src/mapping/recent-evaluation.ts

import type { EvaluationOutcome } from './pipeline/types';
import type {
  MappingAcceptedReason,
  MappingAcceptedSource,
  MappingEvaluationCandidate,
  MappingEvaluationCandidateStatus,
  MappingRecentEvaluationTrace,
  ResolvedMapping,
} from './types';

const RECENT_TRACE_CANDIDATE_LIMIT = 8;

const candidateStatusPriority: Record<MappingEvaluationCandidateStatus, number> = {
  accepted: 4,
  rejected: 3,
  suppressed: 2,
  'not-accepted': 1,
};

export function describeAcceptanceReason(reason: MappingAcceptedReason): string {
  switch (reason) {
    case 'exact-upstream': {
      return 'Exact upstream mapping';
    }
    case 'manual-override': {
      return 'Manual override';
    }
    case 'exact-title-match': {
      return 'Exact title match';
    }
    case 'verified-inherited': {
      return 'Inherited from related AniList mapping';
    }
    case 'fuzzy-match': {
      return 'Fuzzy title match';
    }
    case 'borrowed-base-title-fallback': {
      return 'Borrowed base-title fallback';
    }
  }
}

export function describeCandidate(
  reason: MappingAcceptedReason,
  status: MappingEvaluationCandidateStatus,
): string {
  const base = describeAcceptanceReason(reason);
  switch (status) {
    case 'accepted': {
      return base;
    }
    case 'rejected': {
      return `${base} rejected by candidate suppression`;
    }
    case 'suppressed': {
      return `${base} suppressed`;
    }
    case 'not-accepted': {
      return `${base} not accepted`;
    }
  }
}

export function mergeTraceCandidates(
  candidates: readonly MappingEvaluationCandidate[],
): MappingEvaluationCandidate[] {
  const byProviderId = new Map<number, MappingEvaluationCandidate>();

  for (const candidate of candidates) {
    const existing = byProviderId.get(candidate.providerId);
    if (!existing) {
      byProviderId.set(candidate.providerId, candidate);
      continue;
    }

    const existingPriority = candidateStatusPriority[existing.status];
    const nextPriority = candidateStatusPriority[candidate.status];
    if (
      nextPriority > existingPriority ||
      (nextPriority === existingPriority && (candidate.score ?? 0) > (existing.score ?? 0))
    ) {
      byProviderId.set(candidate.providerId, candidate);
    }
  }

  return [...byProviderId.values()]
    .toSorted((left, right) => {
      const statusDiff = candidateStatusPriority[right.status] - candidateStatusPriority[left.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return (right.score ?? 0) - (left.score ?? 0);
    })
    .slice(0, RECENT_TRACE_CANDIDATE_LIMIT);
}

export function mergeRecentEvaluations(
  ...traces: Array<MappingRecentEvaluationTrace | undefined>
): MappingRecentEvaluationTrace | undefined {
  const searchTerms: string[] = [];
  const searchTermSeen = new Set<string>();
  const candidates: MappingEvaluationCandidate[] = [];

  for (const trace of traces) {
    if (!trace) {
      continue;
    }
    for (const searchTerm of trace.searchTerms ?? []) {
      if (!searchTermSeen.has(searchTerm)) {
        searchTerms.push(searchTerm);
        searchTermSeen.add(searchTerm);
      }
    }
    candidates.push(...trace.candidates);
  }

  if (searchTerms.length === 0 && candidates.length === 0) {
    return undefined;
  }

  return {
    attemptedAt: Date.now(),
    ...(searchTerms.length > 0 ? { searchTerms } : {}),
    candidates: mergeTraceCandidates(candidates),
  };
}

export function createRecentEvaluationTrace(
  searchTerms: readonly string[],
  candidates: readonly MappingEvaluationCandidate[],
): MappingRecentEvaluationTrace | undefined {
  if (searchTerms.length === 0 && candidates.length === 0) {
    return undefined;
  }

  return {
    attemptedAt: Date.now(),
    ...(searchTerms.length > 0 ? { searchTerms: [...searchTerms] } : {}),
    candidates: mergeTraceCandidates(candidates),
  };
}

export function createSingleCandidateTrace(
  resolved: ResolvedMapping,
  source: MappingAcceptedSource,
  status: MappingEvaluationCandidateStatus,
  searchTerms: readonly string[] = [],
  title?: string,
): MappingRecentEvaluationTrace | undefined {
  return createRecentEvaluationTrace(searchTerms, [
    {
      providerId: resolved.providerId,
      ...(title ? { title } : {}),
      source,
      reason: resolved.reason,
      status,
      summary: describeCandidate(resolved.reason, status),
    },
  ]);
}

export function rewriteTraceCandidateStatus(
  trace: MappingRecentEvaluationTrace | undefined,
  providerId: number,
  status: MappingEvaluationCandidateStatus,
): MappingRecentEvaluationTrace | undefined {
  if (!trace) {
    return undefined;
  }

  const candidates = trace.candidates.map((candidate) => (
    candidate.providerId === providerId
      ? {
          ...candidate,
          status,
          summary: describeCandidate(candidate.reason, status),
        }
      : candidate
  ));

  return createRecentEvaluationTrace(trace.searchTerms ?? [], candidates);
}

export function createPipelineRecentEvaluation(
  outcome: EvaluationOutcome,
): MappingRecentEvaluationTrace | undefined {
  return createRecentEvaluationTrace(
    outcome.searchTerms,
    outcome.candidates.map((candidate) => {
      const status: MappingEvaluationCandidateStatus =
        outcome.status === 'resolved' && candidate.providerId === outcome.providerId
          ? 'accepted'
          : 'not-accepted';

      return {
        providerId: candidate.providerId,
        title: candidate.title,
        source: 'auto',
        reason: candidate.reason,
        status,
        summary: describeCandidate(candidate.reason, status),
        score: candidate.score,
      };
    }),
  );
}
