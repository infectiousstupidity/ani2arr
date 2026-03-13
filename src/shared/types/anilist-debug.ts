import type { RequestPriority } from './mapping';

export type AniListSchedulerEventType =
  | 'request'
  | 'enqueue'
  | 'promote'
  | 'join-inflight'
  | 'cache-hit'
  | 'hold'
  | 'flush'
  | 'rate-limit'
  | 'resume';

export interface AniListSchedulerRequestDebug {
  requestId: number;
  at: number;
  priority: RequestPriority;
  source: string;
  ids: number[];
  forceRefresh: boolean;
}

export interface AniListSchedulerPendingEntryDebug {
  id: number;
  priority: RequestPriority;
  waiterCount: number;
  requestIds: number[];
  sources: string[];
  forceRefresh: boolean;
  enqueuedAt: number;
  promotedFrom: RequestPriority | null;
}

export interface AniListSchedulerBucketDebug {
  priority: RequestPriority;
  count: number;
  ids: number[];
  logicalRequestIds: number[];
  entries: AniListSchedulerPendingEntryDebug[];
}

export interface AniListSchedulerBatchMediaCountsDebug {
  movies: number;
  series: number;
  specials: number;
  music: number;
  other: number;
  unknown: number;
}

export interface AniListSchedulerBatchDebug {
  batchId: number;
  at: number;
  completedAt: number | null;
  priority: RequestPriority;
  contributorRequestIds: number[];
  contributorSources: string[];
  logicalRequestedIdCount: number;
  uniqueRequestedIdCount: number;
  uniqueSentIdCount: number;
  dedupeSavedCount: number;
  cacheHitCount: number;
  joinedInflightCount: number;
  requestedIds: number[];
  sentIds: number[];
  promotedIds: number[];
  mediaCounts: AniListSchedulerBatchMediaCountsDebug;
}

export interface AniListSchedulerEventDebug {
  eventId: number;
  at: number;
  type: AniListSchedulerEventType;
  priority: RequestPriority | null;
  requestId: number | null;
  batchId: number | null;
  ids: number[];
  message: string;
  details: Record<string, string | number | boolean | null>;
}

export interface AniListSchedulerLimiterDebug {
  pausedUntil: number;
  lastKnownLimit: number | null;
  lastKnownRemaining: number | null;
  lastKnownResetAt: number | null;
  last429At: number | null;
  lowPriorityHeld: boolean;
  nextDispatchAtHigh: number;
  nextDispatchAtNormal: number;
  nextDispatchAtLow: number;
}

export interface AniListSchedulerDebugSnapshot {
  generatedAt: number;
  nextFlushAt: number | null;
  inflightIds: number[];
  pendingCounts: Record<RequestPriority, number>;
  pendingBuckets: AniListSchedulerBucketDebug[];
  recentRequests: AniListSchedulerRequestDebug[];
  recentBatches: AniListSchedulerBatchDebug[];
  recentEvents: AniListSchedulerEventDebug[];
  limiter: AniListSchedulerLimiterDebug;
}
