/** Mapping-owned projection for review-table summaries and paging over recorded mapping state. */
// src/mapping/review/list-mappings.ts

import type { RadarrMovieSnapshot, SonarrSeriesSnapshot } from '@/providers';
import type { MappingSummary, MappingSource, MappingStatus, ResolverStateRecord } from '@/mapping/types';

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
      : new Set<MappingSource>(['manual', 'rejected', 'ignored', 'auto', 'unresolved']);
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

  const priorityMap: Record<MappingSource, number> = {
    manual: 6,
    rejected: 5,
    ignored: 4,
    unresolved: 3,
    upstream: 2,
    auto: 1,
  };

  type MappingCandidate = {
    anilistId: number;
    provider: MappingSummary['provider'];
    providerId: MappingSummary['providerId'];
    suppressedProviderId?: MappingSummary['suppressedProviderId'];
    source: MappingSource;
    resolverState?: MappingSummary['resolverState'];
    updatedAt: number;
    hadResolveAttempt?: boolean;
    title?: string;
    priority: number;
  };

  const candidates = new Map<string, MappingCandidate>();
  const applyCandidate = (
    anilistId: number,
    candidate: Omit<MappingCandidate, 'anilistId' | 'priority' | 'updatedAt'> & { updatedAt?: number },
  ) => {
    if (!Number.isFinite(anilistId)) return;
    if (!providers.has(candidate.provider)) return;
    if (!sources.has(candidate.source)) return;
    const priority = priorityMap[candidate.source];
    const key = `${candidate.provider}:${anilistId}`;
    const existing = candidates.get(key);
    if (existing && existing.priority > priority) return;
    candidates.set(key, { ...candidate, anilistId, updatedAt: candidate.updatedAt ?? 0, priority });
  };

  const registerEntries = <T extends { anilistId: number }>(
    entries: T[],
    toCandidate: (entry: T) => Omit<MappingCandidate, 'anilistId' | 'priority' | 'updatedAt'> & { updatedAt?: number },
    shouldInclude?: (entry: T) => boolean,
  ): void => {
    for (const entry of entries) {
      if (shouldInclude && !shouldInclude(entry)) continue;
      applyCandidate(entry.anilistId, toCandidate(entry));
    }
  };

  registerEntries(overridesService.listIgnores(), ignore => ({
    provider: ignore.provider,
    providerId: null,
    source: 'ignored',
    updatedAt: ignore.updatedAt,
    hadResolveAttempt: true,
  }));

  const includeSuppressedEntry = (entry: { provider: MappingSummary['provider']; anilistId: number }) =>
    !overridesService.isIgnored(entry.provider, entry.anilistId);

  registerEntries(
    overridesService.listRejectedCandidates(),
    rejected => ({
      provider: rejected.provider,
      providerId: null,
      suppressedProviderId: rejected.providerId,
      source: 'rejected',
      resolverState: undefined,
      updatedAt: rejected.updatedAt,
      hadResolveAttempt: true,
    }),
    includeSuppressedEntry,
  );

  registerEntries(overridesService.list(), entry => ({
    provider: entry.provider,
    providerId: entry.providerId,
    source: 'manual',
    resolverState: undefined,
    updatedAt: entry.updatedAt,
    hadResolveAttempt: true,
  }));

  const includeUpstream = sources.has('upstream') && providers.has('sonarr');
  if (includeUpstream) {
    for (const pair of upstreamMappingStore.listAllPairs()) {
      applyCandidate(pair.anilistId, {
        provider: 'sonarr',
        providerId: pair.tvdbId,
        source: 'upstream',
        resolverState: undefined,
      });
    }
  }
  
  // `source` stays on the legacy review projection contract for filters and existing UI.
  // Non-mapped resolver outcomes are grouped under `unresolved`; callers must read
  // `resolverState` to distinguish unresolved, ambiguous, and verification-failed.
  registerEntries(resolverStates, entry => {
    if (entry.state === 'mapped') {
      return {
        provider: entry.provider,
        providerId: entry.providerId,
        source: entry.source,
        resolverState: 'mapped',
        updatedAt: entry.updatedAt,
        hadResolveAttempt: entry.source === 'auto',
      };
    }

    return {
      provider: entry.provider,
      providerId: null,
      source: 'unresolved',
      resolverState: entry.state,
      updatedAt: entry.updatedAt,
      hadResolveAttempt: true,
      ...(entry.title ? { title: entry.title } : {}),
    };
  });

  const matchesQuery = (summary: MappingSummary): boolean => {
    if (normalizedQuery === '') return true;
    const haystackParts: string[] = [
      String(summary.anilistId),
      summary.providerId === null ? '' : String(summary.providerId),
      summary.providerMeta?.title ?? '',
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
  for (const candidate of candidates.values()) {
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
      } else if (candidate.title) {
        providerMeta = {
          title: candidate.title,
          type: candidate.provider === 'sonarr' ? 'series' : 'movie',
        };
      }
    }
    const hadResolveAttempt =
      candidate.hadResolveAttempt ||
      candidate.source === 'auto' ||
      candidate.source === 'manual' ||
      candidate.source === 'rejected' ||
      candidate.source === 'ignored';

    const summary: MappingSummary = {
      anilistId,
      provider: candidate.provider,
      providerId,
      ...(candidate.suppressedProviderId === undefined ? {} : { suppressedProviderId: candidate.suppressedProviderId }),
      source: candidate.source,
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
