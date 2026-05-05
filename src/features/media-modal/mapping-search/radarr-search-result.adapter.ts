/** Adapts Radarr lookup payloads into shared manual-mapping result rows. */
// src/features/media-modal/mapping-search/radarr-search-result.adapter.ts

import { parseAniListIdOrNull, type AniListId } from '@/anilist';
import { parseTmdbId, type RadarrLookupMovie } from '@/providers';
import { getProviderRouteSlug } from '@/providers/provider-route-slug';
import type { MappingSearchResult } from './types';

export interface RadarrAdapterOptions {
  baseUrl: string;
  isInLibrary: boolean;
  providerRouteSlugByTmdbId?: Readonly<Record<number, string>>;
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
  const tmdbId = parseTmdbId(movie.tmdbId);
  const { isInLibrary } = opts;
  const providerRouteSlug =
    opts.providerRouteSlugByTmdbId?.[tmdbId] ??
    (isInLibrary ? getProviderRouteSlug('radarr', movie) ?? undefined : undefined);
  const posterUrl = pickPoster(movie, opts.baseUrl);
  const linkedAniListIds = Array.isArray(opts.linkedAniListIdsByTmdbId?.[tmdbId])
    ? opts.linkedAniListIdsByTmdbId[tmdbId]
        .map((id) => parseAniListIdOrNull(id))
        .filter((id): id is AniListId => id !== null)
    : undefined;

  return {
    provider: 'radarr',
    providerId: tmdbId,
    title: movie.title,
    ...(movie.folderName ? { providerFolderName: movie.folderName } : {}),
    ...(typeof movie.year === 'number' ? { year: movie.year } : {}),
    typeLabel: 'Movie',
    isInLibrary,
    ...(providerRouteSlug ? { providerRouteSlug } : {}),
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
    ...(linkedAniListIds?.length ? { linkedAniListIds: [...new Set(linkedAniListIds)] } : {}),
  };
}
