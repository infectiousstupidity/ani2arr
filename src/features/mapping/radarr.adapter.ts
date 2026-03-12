import type { MappingSearchResult, RadarrLookupMovie } from '@/shared/types';
import { getLibrarySlug } from '@/services/helpers/path-utils';

export interface RadarrAdapterOptions {
  baseUrl: string;
  libraryTmdbIds?: readonly number[];
  librarySlugByTmdbId?: Readonly<Record<number, string>>;
  linkedAniListIdsByTmdbId?: Readonly<Record<number, readonly number[]>>;
}

const joinUrl = (root: string, path?: string | null): string | undefined => {
  if (!path) return undefined;
  const trimmedRoot = root.replace(/\/$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedRoot}${normalized}`;
};

const pickPoster = (movie: RadarrLookupMovie, baseUrl: string): string | undefined => {
  const images = Array.isArray(movie.images) ? movie.images : [];
  const poster = images.find(image => (image?.coverType || '').toLowerCase() === 'poster');

  if (poster) {
    if (poster.url && baseUrl) {
      return joinUrl(baseUrl, poster.url);
    }
    return poster.remoteUrl ?? undefined;
  }

  return movie.remotePoster ?? undefined;
};

export function toMappingSearchResultFromRadarr(
  movie: RadarrLookupMovie,
  opts: RadarrAdapterOptions,
): MappingSearchResult {
  const tmdbId = movie.tmdbId;
  const librarySet = new Set(opts.libraryTmdbIds ?? []);
  const inLibrary = librarySet.has(tmdbId);
  const librarySlug =
    opts.librarySlugByTmdbId?.[tmdbId] ??
    (inLibrary ? getLibrarySlug('radarr', movie) ?? undefined : undefined);
  const posterUrl = pickPoster(movie, opts.baseUrl);
  const linkedAniListIds = Array.isArray(opts.linkedAniListIdsByTmdbId?.[tmdbId])
    ? opts.linkedAniListIdsByTmdbId[tmdbId].filter(
        (id): id is number => typeof id === 'number' && Number.isFinite(id),
      )
    : undefined;

  return {
    service: 'radarr',
    target: { id: tmdbId, kind: 'tmdb' },
    title: movie.title,
    ...(typeof movie.year === 'number' ? { year: movie.year } : {}),
    typeLabel: 'Movie',
    inLibrary,
    ...(librarySlug ? { librarySlug } : {}),
    ...(posterUrl ? { posterUrl } : {}),
    ...(movie.status ? { statusLabel: movie.status } : {}),
    ...(movie.overview ? { overview: movie.overview } : {}),
    ...(movie.alternateTitles?.length
      ? {
          alternateTitles: movie.alternateTitles
            .map(title => title?.title)
            .filter((title): title is string => typeof title === 'string' && title.length > 0),
        }
      : {}),
    ...(typeof movie.runtime === 'number' ? { episodeOrMovieCount: movie.runtime } : {}),
    ...(movie.hasFile ? { fileCount: 1 } : {}),
    ...(linkedAniListIds?.length ? { linkedAniListIds: Array.from(new Set(linkedAniListIds)) } : {}),
  };
}
