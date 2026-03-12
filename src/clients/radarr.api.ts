import { BaseArrClient, type ArrCredentials } from '@/clients/base-arr.client';
import { resolveArrTagIds } from '@/clients/tag-resolver';
import { createError, ErrorCode } from '@/shared/errors/error-utils';
import { hasRadarrPermission } from '@/shared/radarr/validation';
import type {
  RadarrLookupMovie,
  RadarrMinimumAvailability,
  RadarrMovie,
  RadarrQualityProfile,
  RadarrRootFolder,
  RadarrTag,
} from '@/shared/types';

export interface RadarrSystemStatus {
  version: string;
  appName?: string;
  instanceName?: string;
  isDebug?: boolean;
  isProduction?: boolean;
  urlBase?: string;
}

export interface RadarrCommandResource {
  id?: number;
  name?: string;
  state?: string;
  message?: string | null;
  startedOn?: string;
  endedOn?: string;
  body?: unknown;
}

export interface AddRadarrMoviePayload {
  title: string;
  tmdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored?: boolean;
  minimumAvailability?: RadarrMinimumAvailability;
  tags?: number[];
  freeformTags?: string[];
  path?: string;
  year?: number;
  imdbId?: string | null;
  addOptions?: {
    searchForMovie?: boolean;
  };
}

export class RadarrApiService extends BaseArrClient {
  public constructor() {
    super({
      serviceName: 'Radarr',
      logScope: 'RadarrApiService',
      cacheableEndpoints: ['movie', 'qualityprofile', 'rootfolder', 'tag'],
      hasPermission: hasRadarrPermission,
    });
  }

  public getAllMovies = async (credentials: ArrCredentials): Promise<RadarrMovie[]> => {
    return this.request<RadarrMovie[]>('movie', credentials);
  };

  public getMovieById = async (movieId: number, credentials: ArrCredentials): Promise<RadarrMovie> => {
    return this.request<RadarrMovie>(`movie/${movieId}`, credentials);
  };

  public getMovieByTmdbId = async (
    tmdbId: number,
    credentials: ArrCredentials,
  ): Promise<RadarrMovie | null> => {
    const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
    const result = await this.request<RadarrMovie | RadarrMovie[]>(`movie?${qs}`, credentials);
    return this.pickSingleMovie(result, tmdbId);
  };

  public lookupMovieByTerm = async (
    term: string,
    credentials: ArrCredentials,
  ): Promise<RadarrLookupMovie[]> => {
    const qs = new URLSearchParams({ term }).toString();
    return this.request<RadarrLookupMovie[]>(`movie/lookup?${qs}`, credentials);
  };

  public lookupMovieByTmdbId = async (
    tmdbId: number,
    credentials: ArrCredentials,
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
    credentials: ArrCredentials,
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

  public getRootFolders = async (credentials: ArrCredentials): Promise<RadarrRootFolder[]> => {
    return this.request<RadarrRootFolder[]>('rootfolder', credentials);
  };

  public getQualityProfiles = async (credentials: ArrCredentials): Promise<RadarrQualityProfile[]> => {
    return this.request<RadarrQualityProfile[]>('qualityprofile', credentials);
  };

  public getTags = async (credentials: ArrCredentials): Promise<RadarrTag[]> => {
    return this.request<RadarrTag[]>('tag', credentials);
  };

  public createTag = async (credentials: ArrCredentials, label: string): Promise<RadarrTag> => {
    const trimmed = label.trim();
    if (!trimmed) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        'Tag label is empty.',
        'Tag label cannot be empty.',
      );
    }

    const created = await this.request<RadarrTag>('tag', credentials, {
      method: 'POST',
      body: JSON.stringify({ label: trimmed }),
    });

    this.invalidateCachedEndpoint('tag');

    return created;
  };

  public getMetadata = async (
    credentials: ArrCredentials,
  ): Promise<{
    qualityProfiles: RadarrQualityProfile[];
    rootFolders: RadarrRootFolder[];
    tags: RadarrTag[];
  }> => {
    const [qualityProfiles, rootFolders, tags] = await Promise.all([
      this.getQualityProfiles(credentials),
      this.getRootFolders(credentials),
      this.getTags(credentials),
    ]);

    return { qualityProfiles, rootFolders, tags };
  };

  public getSystemStatus = async (credentials: ArrCredentials): Promise<RadarrSystemStatus> => {
    return this.request<RadarrSystemStatus>('system/status', credentials);
  };

  public testConnection = async (credentials: ArrCredentials): Promise<RadarrSystemStatus> => {
    return this.getSystemStatus(credentials);
  };

  public addMovie = async (
    payload: AddRadarrMoviePayload,
    credentials: ArrCredentials,
  ): Promise<RadarrMovie> => {
    const finalTagIds = await resolveArrTagIds({
      api: this,
      credentials,
      existingIdsFromForm: Array.isArray(payload.tags)
        ? payload.tags.filter(id => typeof id === 'number' && Number.isFinite(id))
        : [],
      freeformLabelsFromForm: Array.isArray(payload.freeformTags) ? payload.freeformTags : [],
      serviceLabel: 'Radarr',
    });

    const {
      freeformTags: _unusedFreeformTags,
      addOptions,
      monitored = true,
      minimumAvailability = 'released',
      ...rest
    } = payload;
    void _unusedFreeformTags;

    const apiPayload = {
      ...rest,
      monitored,
      minimumAvailability,
      tags: finalTagIds,
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
    credentials: ArrCredentials,
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

  public triggerMovieSearch = async (
    movieIds: number[],
    credentials: ArrCredentials,
  ): Promise<RadarrCommandResource> => {
    return this.triggerCommand(
      {
        name: 'MoviesSearch',
        movieIds: this.filterNumericIds(movieIds),
      },
      credentials,
    );
  };

  public triggerRefreshMovie = async (
    movieIds: number[],
    credentials: ArrCredentials,
  ): Promise<RadarrCommandResource> => {
    return this.triggerCommand(
      {
        name: 'RefreshMovie',
        movieIds: this.filterNumericIds(movieIds),
      },
      credentials,
    );
  };

  private async triggerCommand(
    payload: {
      name: string;
      movieIds: number[];
    },
    credentials: ArrCredentials,
  ): Promise<RadarrCommandResource> {
    if (payload.movieIds.length === 0) {
      throw createError(
        ErrorCode.VALIDATION_ERROR,
        `${payload.name} requires at least one movie ID.`,
        'Select at least one movie first.',
      );
    }

    return this.request<RadarrCommandResource>('command', credentials, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  private filterNumericIds(ids: number[]): number[] {
    return ids.filter(id => typeof id === 'number' && Number.isFinite(id));
  }

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
      return result.find(predicate) ?? result[0] ?? null;
    }

    return result ?? null;
  }
}
