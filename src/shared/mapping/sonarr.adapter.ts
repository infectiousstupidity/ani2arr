// src/shared/mapping/sonarr.adapter.ts
import type { MappingSearchResult, SonarrLookupSeries } from '@/shared/types';

export interface SonarrAdapterOptions {
  baseUrl: string; // absolute; trailing slash trimmed
  libraryTvdbIds?: readonly number[];
  librarySlugByTvdbId?: Readonly<Record<number, string>>;
  statsMap?: Readonly<Record<number, {
    seasonCount?: number;
    episodeCount?: number;
    episodeFileCount?: number;
    totalEpisodeCount?: number;
    sizeOnDisk?: number;
    percentOfEpisodes?: number;
  }>>;
}

const joinUrl = (root: string, path?: string | null): string | undefined => {
  if (!path) return undefined;
  const trimmedRoot = root.replace(/\/$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedRoot}${normalized}`;
};

const pickPoster = (series: SonarrLookupSeries, baseUrl: string): string | undefined => {
  const images = Array.isArray(series.images) ? series.images : [];
  const poster = images.find(img => (img?.coverType || '').toLowerCase() === 'poster');
  
  if (poster) {
    // Prefer local/proxy URL if available so it matches Sonarr dashboard
    if (poster.url && baseUrl) {
      return joinUrl(baseUrl, poster.url);
    }
    return poster.remoteUrl ?? undefined;
  }
  
  if (series.remotePoster) return series.remotePoster;
  return undefined;
};

export function toMappingSearchResultFromSonarr(
  series: SonarrLookupSeries,
  opts: SonarrAdapterOptions,
): MappingSearchResult {
  const tvdbId = series.tvdbId;
  const librarySet = new Set(opts.libraryTvdbIds ?? []);
  const inLibrary = librarySet.has(tvdbId);
  const librarySlug = opts.librarySlugByTvdbId?.[tvdbId] ?? (inLibrary ? series.titleSlug : undefined);
  const year = typeof series.year === 'number' ? series.year : undefined;
  const typeLabel = series.seriesType;
  const posterUrl = pickPoster(series, opts.baseUrl);
  const statusLabel = series.status;
  const networkOrStudio = series.network;
  
  // Merge cached statistics if available. Prefer cache over lookup endpoint's zeroed stats.
  // The lookup endpoint returns statistics: { episodeFileCount: 0, ... } for library items.
  const hasLookupStats = series.statistics && (series.statistics.episodeFileCount ?? 0) > 0;
  const stats = hasLookupStats ? series.statistics : (inLibrary && opts.statsMap?.[tvdbId] ? opts.statsMap[tvdbId] : series.statistics);
  const episodeOrMovieCount = stats?.episodeCount ?? stats?.totalEpisodeCount;
  const fileCount = stats?.episodeFileCount;

  // Extract additional rich fields (using any cast if types are partial in source)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = series as any;
  const overview = typeof s.overview === 'string' ? s.overview : undefined;
  const imdbId = typeof s.imdbId === 'string' ? s.imdbId : undefined;
  const alternateTitles = Array.isArray(s.alternateTitles)
    ? s.alternateTitles
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => t?.title)
        .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0)
    : undefined;

  return {
    service: 'sonarr',
    target: { id: tvdbId, idType: 'tvdb' },
    title: series.title,
    ...(year !== undefined ? { year } : {}),
    ...(typeLabel ? { typeLabel } : {}),
    inLibrary,
    ...(librarySlug ? { librarySlug } : {}),
    ...(posterUrl !== undefined ? { posterUrl } : {}),
    ...(statusLabel !== undefined ? { statusLabel } : {}),
    ...(networkOrStudio !== undefined ? { networkOrStudio } : {}),
    ...(episodeOrMovieCount !== undefined ? { episodeOrMovieCount } : {}),
    ...(fileCount !== undefined ? { fileCount } : {}),
    ...(overview ? { overview } : {}),
    ...(imdbId ? { imdbId } : {}),
    ...(alternateTitles && alternateTitles.length > 0 ? { alternateTitles } : {}),
  };
}