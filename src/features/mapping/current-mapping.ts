/** Derives the current provider mapping view model from provider status responses. */
// src/features/mapping/current-mapping.ts

import type { CheckMovieStatusResponse, CheckSeriesStatusResponse } from '@/rpc/types';
import type {
  Provider,
  RadarrLookupMovie,
  SonarrLookupSeries,
} from '@/providers';
import {
  getProviderLibrarySlug,
  type ProviderMediaPathSource,
} from '@/providers/library/paths';
import { toMappingSearchResultFromRadarr } from './radarr.adapter';
import { toMappingSearchResultFromSonarr } from './sonarr.adapter';
import type { MappingSearchResult } from './types';

type DeriveCurrentMappingInput =
  | {
      provider: 'radarr';
      status: CheckMovieStatusResponse | null | undefined;
      baseUrl?: string | undefined;
      fallbackProviderId?: number | null | undefined;
      fallbackTitle?: string | undefined;
    }
  | {
      provider: 'sonarr';
      status: CheckSeriesStatusResponse | null | undefined;
      baseUrl?: string | undefined;
      fallbackProviderId?: number | null | undefined;
      fallbackTitle?: string | undefined;
    };

function buildFallbackMapping(input: {
  provider: Provider;
  providerId: number;
  title?: string | undefined;
  inLibrary: boolean;
  librarySlug?: string | null | undefined;
  linkedAniListIds?: number[] | undefined;
}): MappingSearchResult {
  const providerLabel = input.provider === 'radarr' ? 'TMDB' : 'TVDB';

  return {
    provider: input.provider,
    providerId: input.providerId,
    title: input.title ? `${input.title} (${providerLabel} ${input.providerId})` : `${providerLabel} ${input.providerId}`,
    inLibrary: input.inLibrary,
    ...(input.librarySlug ? { librarySlug: input.librarySlug } : {}),
    ...(input.linkedAniListIds?.length ? { linkedAniListIds: input.linkedAniListIds } : {}),
  };
}

function deriveRadarrCurrentMapping(input: {
  status: CheckMovieStatusResponse | null | undefined;
  baseUrl?: string | undefined;
  fallbackProviderId?: number | null | undefined;
  fallbackTitle?: string | undefined;
}): MappingSearchResult | null {
  const statusProviderId = input.status?.tmdbId ?? null;
  const providerId = statusProviderId ?? input.fallbackProviderId ?? null;
  if (providerId == null) {
    return null;
  }

  const inLibrary = Boolean(input.status?.exists);
  const linkedAniListIds = input.status?.linkedAniListIds;
  const movie = input.status?.movie;

  if (movie && 'images' in movie) {
    return {
      ...toMappingSearchResultFromRadarr(movie as RadarrLookupMovie, {
        baseUrl: input.baseUrl ?? '',
        inLibrary,
      }),
      ...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
    };
  }

  return buildFallbackMapping({
    provider: 'radarr',
    providerId,
    title: movie?.title ?? (statusProviderId == null ? input.fallbackTitle : undefined),
    inLibrary,
    librarySlug: getProviderLibrarySlug('radarr', movie as ProviderMediaPathSource | undefined),
    linkedAniListIds,
  });
}

function deriveSonarrCurrentMapping(input: {
  status: CheckSeriesStatusResponse | null | undefined;
  baseUrl?: string | undefined;
  fallbackProviderId?: number | null | undefined;
  fallbackTitle?: string | undefined;
}): MappingSearchResult | null {
  const statusProviderId = input.status?.tvdbId ?? null;
  const providerId = statusProviderId ?? input.fallbackProviderId ?? null;
  if (providerId == null) {
    return null;
  }

  const inLibrary = Boolean(input.status?.exists);
  const linkedAniListIds = input.status?.linkedAniListIds;
  const series = input.status?.series;

  if (series && 'images' in series) {
    return {
      ...toMappingSearchResultFromSonarr(series as SonarrLookupSeries, {
        baseUrl: input.baseUrl ?? '',
        libraryTvdbIds: inLibrary ? [providerId] : [],
      }),
      ...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
    };
  }

  return buildFallbackMapping({
    provider: 'sonarr',
    providerId,
    title: series?.title ?? (statusProviderId == null ? input.fallbackTitle : undefined),
    inLibrary,
    librarySlug: getProviderLibrarySlug('sonarr', series as ProviderMediaPathSource | undefined),
    linkedAniListIds,
  });
}

export function deriveCurrentMapping(input: DeriveCurrentMappingInput): MappingSearchResult | null {
  if (input.provider === 'radarr') {
    return deriveRadarrCurrentMapping(input);
  }

  return deriveSonarrCurrentMapping(input);
}
