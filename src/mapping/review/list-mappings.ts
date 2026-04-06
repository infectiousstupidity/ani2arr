/** Mapping-owned projection for review-table summaries and paging over recorded mapping state. */
// src/mapping/review/list-mappings.ts

import type { RadarrMovieSnapshot, SonarrSeriesSnapshot } from '@/providers';
import type { MappingSummary, MappingSource, MappingStatus, ResolverStateRecord } from '@/mapping/types';
import { projectMappingReview } from './project-review';

export interface ListMappingsCursor {
  updatedAt: number;
  anilistId: number;
  provider: MappingSummary['provider'];
}

export interface ListMappingsInput {
  sources?: MappingSource[] | undefined;
  providers?: MappingSummary['provider'][] | undefined;
  limit?: number | undefined;
  cursor?: ListMappingsCursor | undefined;
  query?: string | undefined;
}

export interface ListMappingsDeps {
  overridesService: {
    listIgnores(): Array<{ anilistId: number; provider: MappingSummary['provider']; updatedAt: number }>;
    listRejectedCandidates(): Array<{
      anilistId: number;
      provider: MappingSummary['provider'];
      providerId: NonNullable<MappingSummary['providerId']>;
      updatedAt: number;
    }>;
    list(): Array<{
      anilistId: number;
      provider: MappingSummary['provider'];
      providerId: NonNullable<MappingSummary['providerId']>;
      updatedAt: number;
    }>;
    isIgnored(provider: MappingSummary['provider'], anilistId: number): boolean;
    getLinkedAniListIds(
      provider: MappingSummary['provider'],
      providerId: NonNullable<MappingSummary['providerId']>,
    ): number[];
  };
  upstreamMappingStore: {
    listAllPairs(): Array<{ anilistId: number; tvdbId: number }>;
    getAniListIdsForTvdb(tvdbId: number): number[];
  };
  sonarrLibrary: {
    getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]>;
  };
  radarrLibrary: {
    getLeanMovieList(): Promise<RadarrMovieSnapshot[]>;
  };
  resolverStateStore: {
    list(provider?: MappingSummary['provider']): Promise<Array<ResolverStateRecord & {
      anilistId: number;
      provider: MappingSummary['provider'];
    }>>;
  };
}

export async function listMappings(
  input: ListMappingsInput | undefined,
  deps: ListMappingsDeps,
): Promise<{
  mappings: MappingSummary[];
  total: number;
  nextCursor: ListMappingsCursor | null;
}> {
  const { overridesService, upstreamMappingStore, sonarrLibrary, radarrLibrary, resolverStateStore } = deps;
  const normalizedQuery = input?.query?.trim().toLowerCase() || '';
  const sources =
    input?.sources && input.sources.length > 0
      ? new Set<MappingSource>(input.sources)
      : new Set<MappingSource>(['manual', 'rejected', 'ignored', 'auto', 'upstream', 'unresolved']);
  const providers =
    input?.providers && input.providers.length > 0
      ? new Set<MappingSummary['provider']>(input.providers)
      : new Set<MappingSummary['provider']>(['sonarr', 'radarr']);

  const defaultLimit = normalizedQuery ? 200 : 500;
  const limit = Math.min(Math.max(input?.limit ?? defaultLimit, 1), 2000);
  const cursor = input?.cursor;

  const [library, radarrLibraryItems, resolverStates] = await Promise.all([
    sonarrLibrary.getLeanSeriesList().catch(() => [] as SonarrSeriesSnapshot[]),
    radarrLibrary.getLeanMovieList().catch(() => [] as RadarrMovieSnapshot[]),
    resolverStateStore.list(),
  ]);

  const libraryByTvdbId = new Map<number, SonarrSeriesSnapshot>();
  for (const series of library) {
    libraryByTvdbId.set(series.tvdbId, series);
  }
  const libraryByTmdbId = new Map<number, RadarrMovieSnapshot>();
  for (const movie of radarrLibraryItems) {
    libraryByTmdbId.set(movie.tmdbId, movie);
  }

  type MappingCandidate = {
    anilistId: number;
    provider: MappingSummary['provider'];
    providerId: MappingSummary['providerId'];
    suppressedProviderId?: MappingSummary['suppressedProviderId'];
    source: MappingSource;
    acceptedEvidence?: MappingSummary['acceptedEvidence'];
    recentEvaluation?: MappingSummary['recentEvaluation'];
    suppressionKind?: MappingSummary['suppressionKind'];
    exactUpstreamMatchProviderId?: number | null;
    resolverState?: MappingSummary['resolverState'];
    updatedAt: number;
    hadResolveAttempt?: boolean;
  };

  const resolveRecentEvaluationTitle = (
    recentEvaluation: MappingSummary['recentEvaluation'] | undefined,
  ): string | undefined => {
    if (!recentEvaluation) {
      return undefined;
    }

    const candidateTitle = recentEvaluation.candidates.find((candidate) => candidate.title)?.title?.trim();
    if (candidateTitle) {
      return candidateTitle;
    }

    return recentEvaluation.searchTerms?.find((term) => term.trim().length > 0)?.trim();
  };

  const createKey = (provider: MappingSummary['provider'], anilistId: number): string => `${provider}:${anilistId}`;
  const maxUpdatedAt = (...values: Array<number | undefined>): number => {
    let max = 0;
    for (const value of values) {
      if (typeof value === 'number') {
        max = Math.max(max, value);
      }
    }
    return max;
  };
  const setLatest = <T extends { updatedAt: number }>(map: Map<string, T>, key: string, entry: T): void => {
    const existing = map.get(key);
    if (!existing || entry.updatedAt >= existing.updatedAt) {
      map.set(key, entry);
    }
  };

  const ignoreByKey = new Map<string, ReturnType<ListMappingsDeps['overridesService']['listIgnores']>[number]>();
  const rejectedByKey = new Map<string, ReturnType<ListMappingsDeps['overridesService']['listRejectedCandidates']>[number]>();
  const manualByKey = new Map<string, ReturnType<ListMappingsDeps['overridesService']['list']>[number]>();
  const resolverStateByKey = new Map<string, Awaited<ReturnType<ListMappingsDeps['resolverStateStore']['list']>>[number]>();
  const upstreamByKey = new Map<string, { anilistId: number; provider: 'sonarr'; providerId: number }>();
  const keys = new Set<string>();

  for (const ignore of overridesService.listIgnores()) {
    if (!providers.has(ignore.provider)) continue;
    const key = createKey(ignore.provider, ignore.anilistId);
    setLatest(ignoreByKey, key, ignore);
    keys.add(key);
  }

  for (const rejected of overridesService.listRejectedCandidates()) {
    if (!providers.has(rejected.provider)) continue;
    const key = createKey(rejected.provider, rejected.anilistId);
    setLatest(rejectedByKey, key, rejected);
    keys.add(key);
  }

  for (const manual of overridesService.list()) {
    if (!providers.has(manual.provider)) continue;
    const key = createKey(manual.provider, manual.anilistId);
    setLatest(manualByKey, key, manual);
    keys.add(key);
  }

  if (providers.has('sonarr')) {
    for (const pair of upstreamMappingStore.listAllPairs()) {
      const key = createKey('sonarr', pair.anilistId);
      upstreamByKey.set(key, {
        anilistId: pair.anilistId,
        provider: 'sonarr',
        providerId: pair.tvdbId,
      });
      keys.add(key);
    }
  }

  for (const resolverState of resolverStates) {
    if (!providers.has(resolverState.provider)) continue;
    const key = createKey(resolverState.provider, resolverState.anilistId);
    resolverStateByKey.set(key, resolverState);
    keys.add(key);
  }

  const withRejectedConflict = (
    candidate: MappingCandidate,
    rejected: ReturnType<ListMappingsDeps['overridesService']['listRejectedCandidates']>[number] | undefined,
  ): MappingCandidate => {
    if (!rejected) {
      return candidate;
    }

    return {
      ...candidate,
      suppressedProviderId: rejected.providerId,
      suppressionKind: 'rejected-candidate',
      updatedAt: maxUpdatedAt(candidate.updatedAt, rejected.updatedAt),
    };
  };

  const buildManualCandidate = (
    anilistId: number,
    provider: MappingSummary['provider'],
    manual: ReturnType<ListMappingsDeps['overridesService']['list']>[number],
    upstream: { anilistId: number; provider: 'sonarr'; providerId: number } | undefined,
    rejected: ReturnType<ListMappingsDeps['overridesService']['listRejectedCandidates']>[number] | undefined,
    resolverState: Awaited<ReturnType<ListMappingsDeps['resolverStateStore']['list']>>[number] | undefined,
  ): MappingCandidate => {
    if (upstream && upstream.providerId === manual.providerId) {
      return withRejectedConflict(
        {
          anilistId,
          provider,
          providerId: manual.providerId,
          source: 'upstream',
          acceptedEvidence: {
            source: 'upstream',
            reason: 'exact-upstream',
          },
          resolverState: 'mapped',
          ...(resolverState?.state === 'mapped' && resolverState.recentEvaluation
            ? { recentEvaluation: resolverState.recentEvaluation }
            : {}),
          updatedAt: maxUpdatedAt(
            manual.updatedAt,
            resolverState?.state === 'mapped' ? resolverState.updatedAt : undefined,
          ),
          hadResolveAttempt: true,
        },
        rejected,
      );
    }

    return withRejectedConflict(
      {
        anilistId,
        provider,
        providerId: manual.providerId,
        source: 'manual',
        acceptedEvidence: {
          source: 'manual',
          reason: 'manual-override',
        },
        resolverState: 'mapped',
        exactUpstreamMatchProviderId: upstream?.providerId ?? null,
        updatedAt: manual.updatedAt,
        hadResolveAttempt: true,
      },
      rejected,
    );
  };

  const candidates: MappingCandidate[] = [];
  for (const key of keys) {
    const [provider, rawAniListId] = key.split(':') as [MappingSummary['provider'], string];
    const anilistId = Number.parseInt(rawAniListId, 10);
    if (!Number.isFinite(anilistId) || !providers.has(provider)) {
      continue;
    }

    const ignore = ignoreByKey.get(key);
    const rejected = rejectedByKey.get(key);
    const manual = manualByKey.get(key);
    const upstream = provider === 'sonarr' ? upstreamByKey.get(key) : undefined;
    const resolverState = resolverStateByKey.get(key);

    let candidate: MappingCandidate | null = null;

    if (manual) {
      candidate = buildManualCandidate(anilistId, provider, manual, upstream, rejected, resolverState);
    } else if (ignore) {
      candidate = withRejectedConflict(
        {
          anilistId,
          provider,
          providerId: null,
          source: 'ignored',
          exactUpstreamMatchProviderId: upstream?.providerId ?? null,
          updatedAt: ignore.updatedAt,
          hadResolveAttempt: true,
        },
        rejected,
      );
    } else if (upstream) {
      candidate = withRejectedConflict(
        {
          anilistId,
          provider,
          providerId: upstream.providerId,
          source: 'upstream',
          acceptedEvidence: {
            source: 'upstream',
            reason: 'exact-upstream',
          },
          resolverState: 'mapped',
          ...(resolverState?.state === 'mapped' && resolverState.recentEvaluation
            ? { recentEvaluation: resolverState.recentEvaluation }
            : {}),
          updatedAt: resolverState?.state === 'mapped' ? resolverState.updatedAt : 0,
        },
        rejected,
      );
    } else if (resolverState?.state === 'mapped') {
      candidate = {
        anilistId,
        provider,
        providerId: resolverState.providerId,
        source: resolverState.acceptedEvidence.source,
        acceptedEvidence: resolverState.acceptedEvidence,
        ...(resolverState.recentEvaluation ? { recentEvaluation: resolverState.recentEvaluation } : {}),
        resolverState: 'mapped',
        updatedAt: resolverState.updatedAt,
        hadResolveAttempt: resolverState.acceptedEvidence.source === 'auto',
      };
    } else if (rejected) {
      candidate = {
        anilistId,
        provider,
        providerId: null,
        suppressedProviderId: rejected.providerId,
        source: 'rejected',
        suppressionKind: 'rejected-candidate',
        updatedAt: rejected.updatedAt,
        hadResolveAttempt: true,
      };
    } else if (resolverState) {
      candidate = {
        anilistId,
        provider,
        providerId: null,
        source: 'unresolved',
        resolverState: resolverState.state,
        ...(resolverState.recentEvaluation ? { recentEvaluation: resolverState.recentEvaluation } : {}),
        updatedAt: resolverState.updatedAt,
        hadResolveAttempt: true,
      };
    }

    if (!candidate) {
      continue;
    }

    if (!sources.has(candidate.source)) {
      continue;
    }

    candidates.push(candidate);
  }

  const matchesQuery = (summary: MappingSummary): boolean => {
    if (normalizedQuery === '') return true;
    const reviewHaystackParts = (summary.reviewItems ?? []).flatMap((item) => [
      item.reason,
      item.summary,
      item.current.providerId === null ? '' : String(item.current.providerId),
      item.proposed?.providerId === undefined || item.proposed.providerId === null
        ? ''
        : String(item.proposed.providerId),
      ...((item.conflicts ?? []).flatMap(conflict => [
        conflict.providerId === null ? '' : String(conflict.providerId),
      ])),
    ]);
    const haystackParts: string[] = [
      String(summary.anilistId),
      summary.providerId === null ? '' : String(summary.providerId),
      summary.suppressedProviderId === null || summary.suppressedProviderId === undefined
        ? ''
        : String(summary.suppressedProviderId),
      summary.providerMeta?.title ?? '',
      ...(summary.reviewSummary?.reasons ?? []),
      ...reviewHaystackParts,
      ...(summary.recentEvaluation?.searchTerms ?? []),
      ...((summary.recentEvaluation?.candidates ?? []).map((candidate) => candidate.title ?? String(candidate.providerId))),
    ];
    const haystack = haystackParts.join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  };

  const getLinkedAniListIds = (
    provider: MappingSummary['provider'],
    providerId: NonNullable<MappingSummary['providerId']>,
  ): number[] => {
    const ids = new Set<number>(overridesService.getLinkedAniListIds(provider, providerId));
    if (provider === 'sonarr') {
      for (const id of upstreamMappingStore.getAniListIdsForTvdb(providerId)) {
        ids.add(id);
      }
    }
    return [...ids];
  };

  const results: MappingSummary[] = [];
  for (const candidate of candidates) {
    const anilistId = candidate.anilistId;
    const providerId = candidate.providerId ?? null;
    const tvdbId = candidate.provider === 'sonarr' ? providerId : null;
    const tmdbId = candidate.provider === 'radarr' ? providerId : null;
    const series = typeof tvdbId === 'number' ? libraryByTvdbId.get(tvdbId) ?? null : null;
    const movie = typeof tmdbId === 'number' ? libraryByTmdbId.get(tmdbId) ?? null : null;
    const linkedAniListIds = providerId === null ? [] : getLinkedAniListIds(candidate.provider, providerId);
    let status: MappingStatus = 'unmapped';
    if (providerId !== null) {
      status = series || movie ? 'in-provider' : 'not-in-provider';
    }

    const inLibraryCount =
      series?.statistics?.episodeCount ??
      series?.statistics?.episodeFileCount ??
      (movie ? (movie.hasFile ? 1 : 0) : undefined);
    const statusLabel =
      series && typeof (series as { status?: unknown }).status === 'string'
        ? (series as { status?: string }).status
        : movie?.status;
    let providerMeta: MappingSummary['providerMeta'];
    if (candidate.source === 'rejected') {
      providerMeta = undefined;
    } else {
      if (series) {
        providerMeta = {
          ...(series.title ? { title: series.title } : {}),
          type: 'series' as const,
          ...(statusLabel ? { statusLabel } : {}),
        };
      } else if (movie) {
        providerMeta = {
          ...(movie.title ? { title: movie.title } : {}),
          type: 'movie' as const,
          ...(statusLabel ? { statusLabel } : {}),
        };
      } else {
        const evaluationTitle = resolveRecentEvaluationTitle(candidate.recentEvaluation);
        if (evaluationTitle) {
          providerMeta = {
            title: evaluationTitle,
            type: candidate.provider === 'sonarr' ? 'series' : 'movie',
          };
        }
      }
    }
    const hadResolveAttempt =
      candidate.hadResolveAttempt ||
      candidate.source === 'auto' ||
      candidate.source === 'manual' ||
      candidate.source === 'rejected' ||
      candidate.source === 'ignored';
    const reviewProjection = projectMappingReview({
      source: candidate.source,
      providerId,
      ...(candidate.acceptedEvidence ? { acceptedEvidence: candidate.acceptedEvidence } : {}),
      ...(candidate.recentEvaluation ? { recentEvaluation: candidate.recentEvaluation } : {}),
      ...(candidate.resolverState ? { resolverState: candidate.resolverState } : {}),
      ...(candidate.exactUpstreamMatchProviderId === undefined
        ? {}
        : { exactUpstreamMatchProviderId: candidate.exactUpstreamMatchProviderId }),
    });

    const summary: MappingSummary = {
      anilistId,
      provider: candidate.provider,
      providerId,
      ...(candidate.suppressedProviderId === undefined ? {} : { suppressedProviderId: candidate.suppressedProviderId }),
      source: candidate.source,
      ...(candidate.acceptedEvidence ? { acceptedEvidence: candidate.acceptedEvidence } : {}),
      ...(candidate.recentEvaluation ? { recentEvaluation: candidate.recentEvaluation } : {}),
      ...(candidate.suppressionKind ? { suppressionKind: candidate.suppressionKind } : {}),
      ...(reviewProjection.reviewSummary ? { reviewSummary: reviewProjection.reviewSummary } : {}),
      ...(reviewProjection.reviewItems ? { reviewItems: reviewProjection.reviewItems } : {}),
      status,
      updatedAt: candidate.updatedAt,
      ...(linkedAniListIds.length > 0 ? { linkedAniListIds } : {}),
      ...(typeof inLibraryCount === 'number' ? { inLibraryCount } : {}),
      ...(providerMeta ? { providerMeta } : {}),
      ...(candidate.resolverState ? { resolverState: candidate.resolverState } : {}),
      ...(hadResolveAttempt ? { hadResolveAttempt: true } : {}),
    };
    if (matchesQuery(summary)) {
      results.push(summary);
    }
  }

  results.sort(
    (a, b) =>
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
      a.provider.localeCompare(b.provider) ||
      a.anilistId - b.anilistId,
  );
  const total = results.length;
  const filteredByCursor =
    cursor && typeof cursor.updatedAt === 'number'
      ? results.filter(summary => {
          const ts = summary.updatedAt ?? 0;
          if (ts < cursor.updatedAt) return true;
          if (ts > cursor.updatedAt) return false;
          const providerDiff = summary.provider.localeCompare(cursor.provider);
          if (providerDiff > 0) return true;
          if (providerDiff < 0) return false;
          return summary.anilistId > cursor.anilistId;
        })
      : results;
  const page = filteredByCursor.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    filteredByCursor.length > page.length && last
      ? {
          updatedAt: last.updatedAt ?? 0,
          anilistId: last.anilistId,
          provider: last.provider,
        }
      : null;

  return { mappings: page, total, nextCursor };
}
