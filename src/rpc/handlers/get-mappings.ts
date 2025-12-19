import type { MappingOverridesService } from '@/services/mapping/overrides.service';
import type { StaticMappingProvider } from '@/services/mapping/static-mapping.provider';
import type { MappingService } from '@/services/mapping';
import type { SonarrLibrary } from '@/services/library/sonarr';
import type { LeanSonarrSeries, MappingSummary, MappingSource, MappingStatus } from '@/shared/types';

export type GetMappingsInput = {
  limit?: number;
  cursor?: { updatedAt: number; anilistId: number };
  query?: string;
  sources?: MappingSource[];
  providers?: MappingSummary['provider'][];
};

type GetMappingsDeps = {
  overridesService: MappingOverridesService;
  staticProvider: StaticMappingProvider;
  mappingService: MappingService;
  sonarrLibrary: SonarrLibrary;
};

export async function getMappingsHandler(
  input: GetMappingsInput | undefined,
  deps: GetMappingsDeps,
): Promise<{ mappings: MappingSummary[]; total: number; nextCursor: { updatedAt: number; anilistId: number } | null }> {
  const { overridesService, staticProvider, mappingService, sonarrLibrary } = deps;
  const normalizedQuery = input?.query?.trim().toLowerCase() || '';
  const sources =
    input?.sources && input.sources.length > 0
      ? new Set<MappingSource>(input.sources)
      : new Set<MappingSource>(['manual', 'ignored', 'auto']);
  const providers =
    input?.providers && input.providers.length > 0
      ? new Set<MappingSummary['provider']>(input.providers)
      : new Set<MappingSummary['provider']>(['sonarr']);
  if (!providers.has('sonarr')) {
    return { mappings: [], total: 0, nextCursor: null };
  }

  const defaultLimit = normalizedQuery ? 200 : 500;
  const limit = Math.min(Math.max(input?.limit ?? defaultLimit, 1), 2000);
  const cursor = input?.cursor;

  let library: LeanSonarrSeries[] = [];
  try {
    library = await sonarrLibrary.getLeanSeriesList();
  } catch {
    library = [];
  }

  const libraryByTvdbId = new Map<number, LeanSonarrSeries>();
  for (const series of library) {
    libraryByTvdbId.set(series.tvdbId, series);
  }

  const priorityMap: Record<MappingSource, number> = {
    ignored: 3,
    manual: 2,
    upstream: 1,
    auto: 0,
  };

  type Candidate = {
    externalId: { id: number; kind: 'tvdb' } | null;
    source: MappingSource;
    updatedAt: number;
    hadResolveAttempt?: boolean;
    priority: number;
  };

  const candidates = new Map<number, Candidate>();
  const applyCandidate = (anilistId: number, candidate: Omit<Candidate, 'priority' | 'updatedAt'> & { updatedAt?: number }) => {
    if (!Number.isFinite(anilistId)) return;
    if (!sources.has(candidate.source)) return;
    const priority = priorityMap[candidate.source];
    const existing = candidates.get(anilistId);
    if (existing && existing.priority > priority) return;
    candidates.set(anilistId, { ...candidate, updatedAt: candidate.updatedAt ?? 0, priority });
  };

  const ignores = overridesService.listIgnores();
  for (const ignore of ignores) {
    applyCandidate(ignore.anilistId, {
      externalId: null,
      source: 'ignored',
      updatedAt: ignore.updatedAt,
      hadResolveAttempt: true,
    });
  }

  const overrides = overridesService.list();
  for (const entry of overrides) {
    applyCandidate(entry.anilistId, {
      externalId: { id: entry.tvdbId, kind: 'tvdb' },
      source: 'manual',
      updatedAt: entry.updatedAt,
      hadResolveAttempt: true,
    });
  }

  if (sources.has('upstream')) {
    for (const pair of staticProvider.listAllPairs()) {
      applyCandidate(pair.anilistId, {
        externalId: { id: pair.tvdbId, kind: 'tvdb' },
        source: 'upstream',
      });
    }
  }

  const recorded = mappingService.getRecordedResolvedMappings();
  for (const entry of recorded) {
    applyCandidate(entry.anilistId, {
      externalId: { id: entry.tvdbId, kind: 'tvdb' },
      source: entry.source === 'upstream' ? 'upstream' : 'auto',
      updatedAt: entry.updatedAt,
      hadResolveAttempt: entry.source === 'auto',
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
  for (const [anilistId, candidate] of candidates.entries()) {
    const externalId = candidate.externalId ?? null;
    const tvdbId = externalId?.id ?? null;
    const series = tvdbId != null ? libraryByTvdbId.get(tvdbId) ?? null : null;
    const linkedAniListIds = tvdbId != null ? mappingService.getLinkedAniListIdsForTvdb(tvdbId) : [];
    const status: MappingStatus =
      tvdbId === null ? 'unmapped' : series ? 'in-provider' : 'not-in-provider';

    const inLibraryCount =
      series?.statistics?.episodeCount ??
      series?.statistics?.episodeFileCount;
    const statusLabel =
      series && typeof (series as { status?: unknown }).status === 'string'
        ? (series as { status?: string }).status
        : undefined;
    const providerMeta = series
      ? {
          ...(series.title ? { title: series.title } : {}),
          type: 'series' as const,
          ...(statusLabel ? { statusLabel } : {}),
        }
      : undefined;
    const hadResolveAttempt =
      candidate.hadResolveAttempt ||
      candidate.source === 'auto' ||
      candidate.source === 'manual' ||
      candidate.source === 'ignored';

    const summary: MappingSummary = {
      anilistId,
      provider: 'sonarr',
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

  results.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.anilistId - b.anilistId);
  const total = results.length;
  const filteredByCursor =
    cursor && typeof cursor.updatedAt === 'number'
      ? results.filter(summary => {
          const ts = summary.updatedAt ?? 0;
          if (ts < cursor.updatedAt) return true;
          if (ts > cursor.updatedAt) return false;
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
        }
      : null;

  return { mappings: page, total, nextCursor };
}
