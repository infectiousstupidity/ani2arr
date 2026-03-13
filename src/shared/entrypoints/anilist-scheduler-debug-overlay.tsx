import React from 'react';
import { useAniListSchedulerDebug, usePublicOptions } from '@/shared/queries';
import type { AniListSchedulerBatchDebug, AniListSchedulerBucketDebug } from '@/shared/types';

const MAX_BATCH_SIZE = 50;

const formatClock = (timestamp: number | null): string => {
  if (!timestamp) return 'n/a';
  return new Date(timestamp).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const summarizeBucket = (bucket: AniListSchedulerBucketDebug) => {
  const logicalIdCount = bucket.entries.reduce((total, entry) => total + entry.waiterCount, 0);
  const uniqueIdCount = bucket.count;
  const mergeSaved = Math.max(0, logicalIdCount - uniqueIdCount);
  const nextQuerySize = Math.min(uniqueIdCount, MAX_BATCH_SIZE);

  return {
    logicalIdCount,
    uniqueIdCount,
    mergeSaved,
    nextQuerySize,
    merged: mergeSaved > 0,
  };
};

const summarizeBatches = (batches: AniListSchedulerBatchDebug[]) => {
  return batches.reduce(
    (totals, batch) => {
      const merged = batch.dedupeSavedCount > 0 || batch.contributorRequestIds.length > 1;

      totals.batchCount += 1;
      totals.logicalRequestCount += batch.contributorRequestIds.length;
      totals.idsQueried += batch.uniqueSentIdCount;
      totals.logicalIdsRequested += batch.logicalRequestedIdCount;
      totals.mergeSavings += batch.dedupeSavedCount;
      totals.cacheHits += batch.cacheHitCount;
      totals.joinedInflight += batch.joinedInflightCount;
      totals.largestQuerySize = Math.max(totals.largestQuerySize, batch.uniqueSentIdCount);
      totals.movies += batch.mediaCounts.movies;
      totals.series += batch.mediaCounts.series;
      totals.specials += batch.mediaCounts.specials;
      totals.music += batch.mediaCounts.music;
      totals.otherFormats += batch.mediaCounts.other + batch.mediaCounts.unknown;

      if (merged) {
        totals.mergedBatchCount += 1;
        totals.mergedRequestCount += batch.contributorRequestIds.length;
      }

      return totals;
    },
    {
      batchCount: 0,
      mergedBatchCount: 0,
      logicalRequestCount: 0,
      mergedRequestCount: 0,
      idsQueried: 0,
      logicalIdsRequested: 0,
      mergeSavings: 0,
      cacheHits: 0,
      joinedInflight: 0,
      largestQuerySize: 0,
      movies: 0,
      series: 0,
      specials: 0,
      music: 0,
      otherFormats: 0,
    },
  );
};

const StatCard: React.FC<{ label: string; value: string | number; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="rounded-xl border border-border-primary/80 bg-bg-tertiary/55 px-3 py-2.5 shadow-sm">
    <div className="text-[10px] uppercase tracking-[0.16em] text-text-secondary">{label}</div>
    <div className="mt-1 font-mono text-lg text-text-primary">{value}</div>
    {hint ? <div className="mt-1 text-[10px] text-text-secondary">{hint}</div> : null}
  </div>
);

const LiveBucketRow: React.FC<{ bucket: AniListSchedulerBucketDebug }> = ({ bucket }) => {
  const summary = summarizeBucket(bucket);

  return (
    <div className="rounded-xl border border-border-primary/80 bg-bg-tertiary/55 px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-accent-primary/25 bg-accent-primary/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-accent-primary">
            {bucket.priority}
          </span>
          <span className="text-xs text-text-secondary">
            {summary.merged ? 'merged pending work' : 'no merge yet'}
          </span>
        </div>
        <div className="rounded-lg bg-bg-primary/65 px-2.5 py-1 text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">next query</div>
          <div className="font-mono text-base text-text-primary">{summary.nextQuerySize}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-text-primary/85">
        <div>logical ids {summary.logicalIdCount}</div>
        <div>unique ids {summary.uniqueIdCount}</div>
        <div>saved by merge {summary.mergeSaved}</div>
        <div>callers {bucket.logicalRequestIds.length}</div>
      </div>
      <div className="mt-2 text-[11px] text-text-secondary">
        Next query would send <span className="font-mono text-text-primary">{summary.nextQuerySize}</span> IDs
        {summary.uniqueIdCount > MAX_BATCH_SIZE ? ' from the head of this bucket' : ''}.
      </div>
      {bucket.ids.length > 0 && (
        <div className="mt-1 font-mono text-[10px] text-text-secondary/80">
          ids [{bucket.ids.slice(0, 18).join(', ')}{bucket.ids.length > 18 ? ', ...' : ''}]
        </div>
      )}
    </div>
  );
};

const BatchRow: React.FC<{ batch: AniListSchedulerBatchDebug }> = ({ batch }) => {
  const merged = batch.dedupeSavedCount > 0 || batch.contributorRequestIds.length > 1;

  return (
    <div className="rounded-xl border border-border-primary/80 bg-bg-tertiary/55 px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-accent-primary/25 bg-accent-primary/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-accent-primary">
            {batch.priority}
          </span>
          <span className="rounded-lg bg-bg-primary/65 px-2 py-1 font-mono text-[11px] text-text-primary">
            query size {batch.uniqueSentIdCount}
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-secondary">{formatClock(batch.at)}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-text-primary/85">
        <div>requests {batch.contributorRequestIds.length}</div>
        <div>logical ids {batch.logicalRequestedIdCount}</div>
        <div>unique ids {batch.uniqueRequestedIdCount}</div>
        <div>merge saved {batch.dedupeSavedCount}</div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            merged
              ? 'bg-success/15 text-success'
              : 'bg-bg-primary/70 text-text-secondary'
          }`}
        >
          {merged ? 'merged before send' : 'sent as-is'}
        </span>
        {batch.cacheHitCount > 0 ? (
          <span className="rounded-full bg-bg-primary/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            cache {batch.cacheHitCount}
          </span>
        ) : null}
      </div>

      <div className="mt-2 text-[11px] text-text-secondary">
        {batch.promotedIds.length > 0 ? ` Promoted ids: ${batch.promotedIds.join(', ')}.` : ''}
      </div>

      <div className="mt-1 font-mono text-[10px] text-text-secondary/80">
        reqs [{batch.contributorRequestIds.join(', ')}]
      </div>
      <div className="mt-1 font-mono text-[10px] text-text-secondary/80">
        ids [{batch.requestedIds.join(', ')}]
      </div>
      {batch.contributorSources.length > 0 && (
        <div className="mt-1 text-[10px] text-text-secondary/75">
          {batch.contributorSources.join(', ')}
        </div>
      )}
    </div>
  );
};

export const AniListSchedulerDebugOverlay: React.FC = () => {
  const { data: publicOptions } = usePublicOptions();
  const enabled = import.meta.env.DEV && (publicOptions?.ui.schedulerDebugOverlayEnabled ?? false);
  const debugQuery = useAniListSchedulerDebug({ enabled, refetchIntervalMs: 400 });
  const snapshot = debugQuery.data;
  const activeBuckets = (snapshot?.pendingBuckets ?? []).filter(bucket => bucket.count > 0);
  const batchTotals = summarizeBatches(snapshot?.recentBatches ?? []);
  const averageQuerySize = (batchTotals.idsQueried / (batchTotals.batchCount || 1)).toFixed(1);
  const mergeRate = batchTotals.batchCount > 0
    ? `${Math.round((batchTotals.mergedBatchCount / batchTotals.batchCount) * 100)}%`
    : '0%';
  const hasOtherFormats = batchTotals.specials > 0 || batchTotals.music > 0 || batchTotals.otherFormats > 0;

  if (!enabled) return null;

  return (
    <div className="fixed right-4 top-4 z-[2147483647] w-[430px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border-primary bg-bg-primary/96 p-3.5 font-sans text-text-primary shadow-[0_18px_70px_rgba(4,12,18,0.36)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-accent-primary">AniList Queries</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">Live merge preview + sent batch history</div>
        </div>
        <div className="rounded-full border border-border-primary bg-bg-secondary/75 px-2.5 py-1 font-mono text-[10px] text-text-secondary">
          updated {formatClock(snapshot?.generatedAt ?? null)}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border-primary bg-bg-secondary/70 px-3 py-2.5 text-[11px] text-text-primary">
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-secondary">live</span>
          <span className="rounded-lg bg-bg-primary/60 px-2.5 py-1 font-mono text-text-primary">
            inflight {snapshot?.inflightIds.length ?? 0}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] text-text-secondary">
          <div>remaining {snapshot?.limiter.lastKnownRemaining ?? 'n/a'}</div>
          <div>limit {snapshot?.limiter.lastKnownLimit ?? 'n/a'}</div>
          <div>pause {formatClock(snapshot?.limiter.pausedUntil || null)}</div>
          <div>{snapshot?.limiter.lowPriorityHeld ? 'low is held' : 'dispatch open'}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-text-secondary">Total stats</div>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Merged requests"
            value={batchTotals.mergedRequestCount}
            hint={`${batchTotals.mergedBatchCount} merged batches, ${mergeRate} of sent history`}
          />
          <StatCard
            label="Requests sent"
            value={batchTotals.logicalRequestCount}
            hint={`${batchTotals.batchCount} AniList queries actually sent`}
          />
          <StatCard
            label="IDs queried"
            value={batchTotals.idsQueried}
            hint={`${batchTotals.logicalIdsRequested} logical ids requested before merge`}
          />
          <StatCard
            label="Merge savings"
            value={batchTotals.mergeSavings}
            hint="Duplicate logical ids collapsed before send"
          />
          <StatCard
            label="Movies queried"
            value={batchTotals.movies}
            hint="Resolved MOVIE responses in sent batches"
          />
          <StatCard
            label="Series queried"
            value={batchTotals.series}
            hint="TV, TV_SHORT, OVA, and ONA responses"
          />
          <StatCard
            label="Largest query"
            value={batchTotals.largestQuerySize}
            hint={`Average query size ${averageQuerySize}`}
          />
          <StatCard
            label="Skipped network"
            value={batchTotals.cacheHits + batchTotals.joinedInflight}
            hint={`${batchTotals.cacheHits} cache hits, ${batchTotals.joinedInflight} joined inflight`}
          />
        </div>
        {hasOtherFormats ? (
          <div className="mt-2 rounded-xl border border-border-primary/80 bg-bg-tertiary/45 px-3 py-2 text-[11px] text-text-secondary">
            Other resolved formats in history: specials {batchTotals.specials}, music {batchTotals.music}, other/unknown {batchTotals.otherFormats}
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-text-secondary">Current merge candidates</div>
        <div className="space-y-2">
          {activeBuckets.length > 0 ? (
            activeBuckets.map(bucket => <LiveBucketRow key={bucket.priority} bucket={bucket} />)
          ) : (
            <div className="rounded-xl border border-dashed border-border-primary/80 bg-bg-secondary/45 px-3 py-4 text-center text-[11px] text-text-secondary">
              No pending AniList queries right now
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-text-secondary">Queries actually sent</div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {(snapshot?.recentBatches ?? []).length > 0 ? (
            (snapshot?.recentBatches ?? []).map(batch => <BatchRow key={batch.batchId} batch={batch} />)
          ) : (
            <div className="rounded-xl border border-dashed border-border-primary/80 bg-bg-secondary/45 px-3 py-4 text-center text-[11px] text-text-secondary">
              No AniList batches have been sent yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
