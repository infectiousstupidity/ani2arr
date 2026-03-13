import type { MappingOverridesService } from '@/services/mapping/overrides.service';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type { MappingService } from '@/services/mapping';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { RadarrLibrary } from '@/services/library/radarr';
import type { LeanRadarrMovie, LeanSonarrSeries, MappingSummary, MappingSource, MappingStatus } from '@/shared/types';

export type GetMappingsInput = {
  limit?: number;
  cursor?: { updatedAt: number; anilistId: number; provider: MappingSummary['provider'] };
  query?: string;
  sources?: MappingSource[];
  providers?: MappingSummary['provider'][];
};

type GetMappingsDeps = {
  overridesService: MappingOverridesService;
  staticProvider: StaticMappingProvider;
  mappingService: MappingService;
  sonarrLibrary: SonarrLibrary;
  radarrLibrary: RadarrLibrary;
};

export async function getMappingsHandler(
  input: GetMappingsInput | undefined,
  deps: GetMappingsDeps,
): Promise<{
  mappings: MappingSummary[];
  total: number;
  nextCursor: { updatedAt: number; anilistId: number; provider: MappingSummary['provider'] } | null;
}> {
  const { overridesService, staticProvider, mappingService, sonarrLibrary, radarrLibrary } = deps;
  const normalizedQuery = input?.query?.trim().toLowerCase() || '';
  const sources =
    input?.sources && input.sources.length > 0
      ? new Set<MappingSource>(input.sources)
      : new Set<MappingSource>(['manual', 'ignored', 'auto', 'unresolved']);
  const providers =
    input?.providers && input.providers.length > 0
      ? new Set<MappingSummary['provider']>(input.providers)
      : new Set<MappingSummary['provider']>(['sonarr', 'radarr']);

  const defaultLimit = normalizedQuery ? 200 : 500;
  const limit = Math.min(Math.max(input?.limit ?? defaultLimit, 1), 2000);
  const cursor = input?.cursor;

  const [library, radarrLibraryItems] = await Promise.all([
    sonarrLibrary.getLeanSeriesList().catch(() => [] as LeanSonarrSeries[]),
    radarrLibrary.getLeanMovieList().catch(() => [] as LeanRadarrMovie[]),
  ]);

  const libraryByTvdbId = new Map<number, LeanSonarrSeries>();
  for (const series of library) {
    libraryByTvdbId.set(series.tvdbId, series);
  }
  const libraryByTmdbId = new Map<number, LeanRadarrMovie>();
  for (const movie of radarrLibraryItems) {
    libraryByTmdbId.set(movie.tmdbId, movie);
  }

  const priorityMap: Record<MappingSource, number> = {
    manual: 4,
    ignored: 3,
    unresolved: 2,
    upstream: 1,
    auto: 0,
  };

  type Candidate = {
    provider: MappingSummary['provider'];
    externalId: MappingSummary['externalId'];
    source: MappingSource;
    updatedAt: number;
    hadResolveAttempt?: boolean;
    title?: string;
    priority: number;
  };

  const candidates = new Map<string, Candidate>();
  const applyCandidate = (
    anilistId: number,
    candidate: Omit<Candidate, 'priority' | 'updatedAt'> & { updatedAt?: number },
  ) => {
    if (!Number.isFinite(anilistId)) return;
    if (!providers.has(candidate.provider)) return;
    if (!sources.has(candidate.source)) return;
    const priority = priorityMap[candidate.source];
    const key = `${candidate.provider}:${anilistId}`;
    const existing = candidates.get(key);
    if (existing && existing.priority > priority) return;
    candidates.set(key, { ...candidate, updatedAt: candidate.updatedAt ?? 0, priority });
  };

  const ignores = overridesService.listIgnores();
  for (const ignore of ignores) {
    applyCandidate(ignore.anilistId, {
      provider: ignore.provider,
      externalId: null,
      source: 'ignored',
      updatedAt: ignore.updatedAt,
      hadResolveAttempt: true,
    });
  }

  const overrides = overridesService.list();
  for (const entry of overrides) {
    applyCandidate(entry.anilistId, {
      provider: entry.provider,
      externalId: entry.externalId,
      source: 'manual',
      updatedAt: entry.updatedAt,
      hadResolveAttempt: true,
    });
  }

  if (sources.has('upstream')) {
    for (const pair of staticProvider.listAllPairs()) {
      applyCandidate(pair.anilistId, {
        provider: 'sonarr',
        externalId: { id: pair.tvdbId, kind: 'tvdb' },
        source: 'upstream',
      });
    }
  }

  const recorded = mappingService.getRecordedResolvedMappings();
  for (const entry of recorded) {
    applyCandidate(entry.anilistId, {
      provider: entry.provider,
      externalId: entry.externalId,
      source: entry.source,
      updatedAt: entry.updatedAt,
      hadResolveAttempt: entry.source === 'auto',
    });
  }

  const unresolved = mappingService.getRecordedUnresolvedMappings();
  for (const entry of unresolved) {
    applyCandidate(entry.anilistId, {
      provider: entry.provider,
      externalId: null,
      source: entry.source,
      updatedAt: entry.updatedAt,
      hadResolveAttempt: true,
      ...(entry.title ? { title: entry.title } : {}),
    });
  }

  const matchesQuery = (summary: MappingSummary): boolean => {
    if (!normalizedQuery) return true;
    const haystackParts: string[] = [
      String(summary.anilistId),
      summary.externalId ? String(summary.externalId.id) : '',
      summary.providerMeta?.title ?? '',
    ];
    const haystack = haystackParts.join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  };

  const results: MappingSummary[] = [];
  for (const [candidateKey, candidate] of candidates.entries()) {
    const [, rawAniListId] = candidateKey.split(':');
    const anilistId = Number(rawAniListId);
    if (!Number.isFinite(anilistId)) continue;
    const externalId = candidate.externalId ?? null;
    const tvdbId = candidate.provider === 'sonarr' && externalId?.kind === 'tvdb' ? externalId.id : null;
    const tmdbId = candidate.provider === 'radarr' && externalId?.kind === 'tmdb' ? externalId.id : null;
    const series = tvdbId != null ? libraryByTvdbId.get(tvdbId) ?? null : null;
    const movie = tmdbId != null ? libraryByTmdbId.get(tmdbId) ?? null : null;
    const linkedAniListIds =
      externalId ? mappingService.getLinkedAniListIds(candidate.provider, externalId) : [];
    const status: MappingStatus =
      externalId === null ? 'unmapped' : series || movie ? 'in-provider' : 'not-in-provider';

    const inLibraryCount =
      series?.statistics?.episodeCount ??
      series?.statistics?.episodeFileCount ??
      (movie ? (movie.hasFile ? 1 : 0) : undefined);
    const statusLabel =
      series && typeof (series as { status?: unknown }).status === 'string'
        ? (series as { status?: string }).status
        : movie?.status;
    const providerMeta = series
      ? {
          ...(series.title ? { title: series.title } : {}),
          type: 'series' as const,
          ...(statusLabel ? { statusLabel } : {}),
        }
      : movie
        ? {
            ...(movie.title ? { title: movie.title } : {}),
            type: 'movie' as const,
            ...(statusLabel ? { statusLabel } : {}),
          }
      : candidate.title
        ? {
            title: candidate.title,
            type: candidate.provider === 'sonarr' ? ('series' as const) : ('movie' as const),
          }
      : undefined;
    const hadResolveAttempt =
      candidate.hadResolveAttempt ||
      candidate.source === 'auto' ||
      candidate.source === 'manual' ||
      candidate.source === 'ignored';

    const summary: MappingSummary = {
      anilistId,
      provider: candidate.provider,
      externalId,
      source: candidate.source,
      status,
      updatedAt: candidate.updatedAt,
      ...(linkedAniListIds.length ? { linkedAniListIds } : {}),
      ...(typeof inLibraryCount === 'number' ? { inLibraryCount } : {}),
      ...(providerMeta ? { providerMeta } : {}),
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
  const last = page[page.length - 1];
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
