/** Radarr-backed library cache and status lookup logic for movie records. */
// src/core/library/radarr-library.ts

import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { StatusInput } from '@/rpc/schemas';
import type { CheckMovieStatusResponse } from '@/rpc/types';
import type { MappingService } from '@/services/mapping';
import type { ResolveExternalIdOptions } from '@/services/mapping/types';
import { ErrorCode, logError, normalizeError } from '@/shared/errors';
import { getExtensionOptionsSnapshot, type ExtensionOptions } from '@/options';
import type { ProviderCredentials, RadarrLookupMovie, RadarrMovie, RadarrMovieSnapshot } from '@/integrations/providers';
import { BaseProviderLibraryStore } from './base-provider-library.store';
import { notifyLibraryMutation } from './library-mutation';
import { RadarrLibraryIndexer } from './radarr-library.indexer';
import type { LibraryMutationEmitter, LibraryStatusOptions, ProviderLibraryCaches } from './library.types';

const CACHE_KEY = 'radarr:lean-movies';

type RadarrLibraryMutationPayload = {
  tmdbId: number;
  action: 'added' | 'removed';
};

export class RadarrLibrary {
  private readonly indexer = new RadarrLibraryIndexer();
  private readonly store: BaseProviderLibraryStore<RadarrMovie, RadarrMovieSnapshot, number>;

  constructor(
    private readonly radarrClient: RadarrClient,
    private readonly mappingService: Pick<
      MappingService,
      'resolveExternalId' | 'prioritizeAniListMedia' | 'getLinkedAniListIds'
    >,
    caches: ProviderLibraryCaches<RadarrMovieSnapshot>,
    private readonly emitLibraryMutation?: LibraryMutationEmitter<RadarrLibraryMutationPayload>,
  ) {
    this.store = new BaseProviderLibraryStore(
      caches,
      this.indexer,
      {
        cacheKey: CACHE_KEY,
        getCredentials: (options) => {
          const { url, apiKey } = options.providers.radarr;
          return url && apiKey ? { url, apiKey } : null;
        },
        fetchAll: async (credentials: ProviderCredentials) => {
          const full = await this.radarrClient.getAllMovies(credentials);
          return full.filter(movie => typeof movie.tmdbId === 'number' && Number.isFinite(movie.tmdbId));
        },
        toSnapshot: (movie: RadarrMovie) => this.toMovieSnapshot(movie),
        getExternalId: (snapshot: RadarrMovieSnapshot) => snapshot.tmdbId,
      },
      'RadarrLibraryStore',
    );
  }

  getLeanMovieList(): Promise<RadarrMovieSnapshot[]> {
    return this.store.getLeanList();
  }

  refreshCache(optionsOverride?: ExtensionOptions): Promise<RadarrMovieSnapshot[]> {
    return this.store.refreshCache(optionsOverride);
  }

  addMovieToCache(newMovie: RadarrMovie): Promise<void> {
    return this.store.addToCache(newMovie);
  }

  removeMovieFromCache(tmdbId: number): Promise<void> {
    return this.store.removeFromCache(tmdbId);
  }

  async getMovieStatus(
    payload: Pick<StatusInput, 'anilistId' | 'title' | 'metadata'>,
    options: LibraryStatusOptions = {},
  ): Promise<CheckMovieStatusResponse> {
    if (import.meta.env.DEV) {
      const priority = options.priority ?? 'normal';
      const network = options.network ?? 'allow';
      console.debug(
        `[ani2arr | RadarrLibrary] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
      );
    }

    const leanList = await this.store.getLeanList();
    const radarrOptions = await getExtensionOptionsSnapshot();
    const isConfigured = Boolean(radarrOptions?.providers.radarr.url && radarrOptions?.providers.radarr.apiKey);

    const normalizedTitle = payload.title?.trim();
    let tmdbId = this.indexer.findTmdbIdInIndex(payload);
    let successfulSynonym: string | undefined;
    let linkedAniListIds: number[] | undefined;

    if (tmdbId === null) {
      if (options.priority === 'high') {
        try {
          this.mappingService.prioritizeAniListMedia?.(payload.anilistId, { schedule: false });
        } catch {
          // best-effort
        }
      }

      const mappingOptions: ResolveExternalIdOptions = {};
      if (!isConfigured || options.network === 'never') mappingOptions.network = 'never';
      if (options.ignoreFailureCache) {
        mappingOptions.ignoreFailureCache = true;
        mappingOptions.forceLookupNetwork = true;
      }
      if (options.priority) mappingOptions.priority = options.priority;
      if (options.force_verify) mappingOptions.forceLookupNetwork = true;

      const hints: NonNullable<ResolveExternalIdOptions['hints']> = {};
      if (normalizedTitle) hints.primaryTitle = normalizedTitle;
      if (payload.metadata) hints.domMedia = payload.metadata;
      if (Object.keys(hints).length > 0) mappingOptions.hints = hints;

      try {
        if (import.meta.env.DEV) {
          console.debug(
            `[ani2arr | RadarrLibrary] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
          );
        }

        const mapping = await this.mappingService.resolveExternalId('radarr', payload.anilistId, mappingOptions);
        if (mapping?.externalId.kind === 'tmdb') {
          tmdbId = mapping.externalId.id;
          successfulSynonym = mapping.successfulSynonym;
        }
      } catch (error) {
        const normalized = normalizeError(error);
        if (
          normalized.code === ErrorCode.CONFIGURATION_ERROR ||
          (normalized.code === ErrorCode.VALIDATION_ERROR && normalized.details?.reason === 'network-disabled')
        ) {
          return { exists: false, tmdbId: null, externalId: null, anilistTmdbLinkMissing: true };
        }
        logError(normalized, `RadarrLibrary:getMovieStatus:${payload.anilistId}`);
        throw normalized;
      }
    }

    if (tmdbId === null) {
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | RadarrLibrary] status:result anilistId=${payload.anilistId} outcome=unresolved`);
      }
      return { exists: false, tmdbId: null, externalId: null, anilistTmdbLinkMissing: true };
    }

    const linked = this.mappingService.getLinkedAniListIds?.('radarr', { id: tmdbId, kind: 'tmdb' }) ?? [];
    if (linked.length > 0) {
      linkedAniListIds = linked;
    }

    const cachedMovie = leanList.find(movie => movie.tmdbId === tmdbId) ?? null;
    const existsInCache = cachedMovie !== null;

    if (!isConfigured || !options.force_verify) {
      return {
        exists: existsInCache,
        tmdbId,
        externalId: { id: tmdbId, kind: 'tmdb' },
        ...(cachedMovie ? { movie: cachedMovie } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
    }

    const credentials = {
      url: radarrOptions!.providers.radarr.url,
      apiKey: radarrOptions!.providers.radarr.apiKey,
    };
    const liveMovie = await this.radarrClient.getMovieByTmdbId(tmdbId, credentials);
    let lookupMovie: RadarrLookupMovie | null = null;

    if (liveMovie) {
      let cacheMutated = false;
      if (!existsInCache) {
        await this.store.addToCache(liveMovie);
        cacheMutated = true;
      }

      if (cacheMutated) {
        await notifyLibraryMutation('RadarrLibrary:notifyLibraryMutation', this.emitLibraryMutation, {
          tmdbId,
          action: 'added',
        });
      }

      return {
        exists: true,
        tmdbId,
        externalId: { id: tmdbId, kind: 'tmdb' },
        movie: liveMovie,
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
    }

    try {
      lookupMovie = await this.radarrClient.lookupMovieByTmdbId(tmdbId, credentials);
    } catch (error) {
      logError(normalizeError(error), `RadarrLibrary:getMovieStatus:lookup:${tmdbId}`);
    }

    if (existsInCache) {
      await this.store.removeFromCache(tmdbId);
      await notifyLibraryMutation('RadarrLibrary:notifyLibraryMutation', this.emitLibraryMutation, {
        tmdbId,
        action: 'removed',
      });
    }

    return {
      exists: false,
      tmdbId,
      externalId: { id: tmdbId, kind: 'tmdb' },
      ...(lookupMovie ? { movie: lookupMovie } : {}),
      ...(successfulSynonym ? { successfulSynonym } : {}),
      ...(linkedAniListIds ? { linkedAniListIds } : {}),
    };
  }

  private toMovieSnapshot(movie: RadarrMovie): RadarrMovieSnapshot {
    const alternateTitles = Array.isArray(movie.alternateTitles)
      ? (movie.alternateTitles.map(title => title?.title?.trim()).filter(Boolean) as string[])
      : [];

    return {
      tmdbId: movie.tmdbId,
      id: movie.id,
      title: movie.title,
      ...(movie.titleSlug ? { titleSlug: movie.titleSlug } : {}),
      ...(movie.sortTitle ? { sortTitle: movie.sortTitle } : {}),
      ...(movie.originalTitle ? { originalTitle: movie.originalTitle } : {}),
      ...(movie.folderName ? { folderName: movie.folderName } : {}),
      ...(movie.imdbId ? { imdbId: movie.imdbId } : {}),
      ...(typeof movie.year === 'number' ? { year: movie.year } : {}),
      ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
      ...(typeof movie.monitored === 'boolean' ? { monitored: movie.monitored } : {}),
      ...(movie.minimumAvailability ? { minimumAvailability: movie.minimumAvailability } : {}),
      ...(typeof movie.hasFile === 'boolean' ? { hasFile: movie.hasFile } : {}),
      ...(typeof movie.sizeOnDisk === 'number' ? { sizeOnDisk: movie.sizeOnDisk } : {}),
      ...(typeof movie.status === 'string' ? { status: movie.status } : {}),
    };
  }
}
