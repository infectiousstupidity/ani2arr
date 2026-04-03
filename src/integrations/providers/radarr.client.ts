/** Radarr transport client for raw Arr API requests and mutations. */
// src/integrations/providers/radarr.client.ts

import { BaseProviderClient } from '@/integrations/providers/base-provider.client';
import { createError, ErrorCode } from '@/shared/errors';
import type { RadarrMinimumAvailability } from '@/shared/schemas/providers/radarr-settings.schema';
import type {
  ProviderQualityProfile,
  ProviderRootFolder,
  ProviderTag,
  RadarrLookupMovie,
  RadarrMovie,
  ProviderCredentials,
} from '@/integrations/providers';

type RadarrClientOptions = {
  hasUrlPermission: (url: string) => Promise<boolean>;
};

export interface AddRadarrMoviePayload {
  title: string;
  tmdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  tags?: number[];
  path?: string;
  year?: number;
  imdbId?: string | null;
  addOptions?: {
    searchForMovie?: boolean;
  };
}

export class RadarrClient extends BaseProviderClient {
  public constructor(options: RadarrClientOptions) {
    super({
      providerName: 'Radarr',
      logScope: 'RadarrClient',
      cacheableEndpoints: ['movie', 'qualityprofile', 'rootfolder', 'tag'],
      hasUrlPermission: options.hasUrlPermission,
    });
  }

  public getAllMovies = async (credentials: ProviderCredentials): Promise<RadarrMovie[]> => {
    return this.request<RadarrMovie[]>('movie', credentials);
  };

  public getMovieById = async (movieId: number, credentials: ProviderCredentials): Promise<RadarrMovie> => {
    return this.request<RadarrMovie>(`movie/${movieId}`, credentials);
  };

  public getMovieByTmdbId = async (
    tmdbId: number,
    credentials: ProviderCredentials,
  ): Promise<RadarrMovie | null> => {
    const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
    const result = await this.request<RadarrMovie | RadarrMovie[]>(`movie?${qs}`, credentials);
    return this.pickSingleMovie(result, tmdbId);
  };

  public lookupMovieByTerm = async (
    term: string,
    credentials: ProviderCredentials,
  ): Promise<RadarrLookupMovie[]> => {
    const qs = new URLSearchParams({ term }).toString();
    return this.request<RadarrLookupMovie[]>(`movie/lookup?${qs}`, credentials);
  };

  public lookupMovieByTmdbId = async (
    tmdbId: number,
    credentials: ProviderCredentials,
  ): Promise<RadarrLookupMovie | null> => {
    const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
    const result = await this.request<RadarrLookupMovie | RadarrLookupMovie[]>(
      `movie/lookup/tmdb?${qs}`,
      credentials,
    );
    return this.pickSingleLookupMovie(result, movie => movie.tmdbId === tmdbId);
  };

  public lookupMovieByImdbId = async (
    imdbId: string,
    credentials: ProviderCredentials,
  ): Promise<RadarrLookupMovie | null> => {
    const trimmed = imdbId.trim();
    if (!trimmed) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        'IMDb ID is empty.',
        'IMDb ID cannot be empty.',
      );
    }

    const qs = new URLSearchParams({ imdbId: trimmed }).toString();
    const result = await this.request<RadarrLookupMovie | RadarrLookupMovie[]>(
      `movie/lookup/imdb?${qs}`,
      credentials,
    );
    return this.pickSingleLookupMovie(result, movie => movie.imdbId === trimmed);
  };

  public getRootFolders = async (credentials: ProviderCredentials): Promise<ProviderRootFolder[]> => {
    return this.request<ProviderRootFolder[]>('rootfolder', credentials);
  };

  public getQualityProfiles = async (credentials: ProviderCredentials): Promise<ProviderQualityProfile[]> => {
    return this.request<ProviderQualityProfile[]>('qualityprofile', credentials);
  };

  public getTags = async (credentials: ProviderCredentials): Promise<ProviderTag[]> => {
    return this.request<ProviderTag[]>('tag', credentials);
  };

  public createTag = async (credentials: ProviderCredentials, label: string): Promise<ProviderTag> => {
    const trimmed = label.trim();
    if (!trimmed) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        'Tag label is empty.',
        'Tag label cannot be empty.',
      );
    }

    const created = await this.request<ProviderTag>('tag', credentials, {
      method: 'POST',
      body: JSON.stringify({ label: trimmed }),
    });

    this.invalidateCachedEndpoint('tag');

    return created;
  };

  public addMovie = async (
    payload: AddRadarrMoviePayload,
    credentials: ProviderCredentials,
  ): Promise<RadarrMovie> => {
    const {
      addOptions,
      monitored = true,
      minimumAvailability = 'released',
      ...rest
    } = payload;

    const apiPayload = {
      ...rest,
      monitored,
      minimumAvailability,
      tags: payload.tags ?? [],
      addOptions: {
        searchForMovie: addOptions?.searchForMovie ?? true,
      },
    };

    this.log.debug('Sending addMovie payload to Radarr:', apiPayload);
    const created = await this.request<RadarrMovie>('movie', credentials, {
      method: 'POST',
      body: JSON.stringify(apiPayload),
    });

    this.invalidateCachedEndpoint('movie');

    return created;
  };

  public updateMovie = async (
    movieId: number,
    payload: RadarrMovie,
    credentials: ProviderCredentials,
    options?: { moveFiles?: boolean },
  ): Promise<RadarrMovie> => {
    const qs = new URLSearchParams();
    if (options?.moveFiles) {
      qs.set('moveFiles', 'true');
    }
    const endpoint = qs.size > 0 ? `movie/${movieId}?${qs.toString()}` : `movie/${movieId}`;

    this.log.debug('Sending updateMovie payload to Radarr:', {
      movieId,
      moveFiles: options?.moveFiles,
      payload,
    });

    const updated = await this.request<RadarrMovie>(endpoint, credentials, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    this.invalidateCachedEndpoint('movie');

    return updated;
  };

  private pickSingleMovie(
    result: RadarrMovie | RadarrMovie[],
    tmdbId: number,
  ): RadarrMovie | null {
    if (Array.isArray(result)) {
      return result.find(movie => movie?.tmdbId === tmdbId) ?? result[0] ?? null;
    }

    return result ?? null;
  }

  private pickSingleLookupMovie(
    result: RadarrLookupMovie | RadarrLookupMovie[],
    predicate: (movie: RadarrLookupMovie) => boolean,
  ): RadarrLookupMovie | null {
    if (Array.isArray(result)) {
      return result.find(movie => predicate(movie)) ?? result[0] ?? null;
    }

    return result ?? null;
  }
}
