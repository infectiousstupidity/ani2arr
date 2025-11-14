import type { MappingSearchResult, SonarrLookupSeries } from '@/shared/types';

export interface SonarrAdapterOptions {
  baseUrl: string; // absolute; trailing slash trimmed
  libraryTvdbIds?: readonly number[];
  librarySlugByTvdbId?: Readonly<Record<number, string>>;
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
    return poster.remoteUrl ?? joinUrl(baseUrl, poster.url ?? undefined);
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
  const episodeOrMovieCount = series.statistics?.seasonCount;

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
  };
}
