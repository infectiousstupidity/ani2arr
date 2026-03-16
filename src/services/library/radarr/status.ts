import { getExtensionOptionsSnapshot } from '@/shared/options/storage';
import { ErrorCode, logError, normalizeError } from '@/shared/errors/error-utils';
import { notifyLibraryMutation } from '@/services/library/notify';
import type { RadarrLibraryStore } from './store';
import type {
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  MappingResolver,
  RadarrClient,
  RadarrLibraryMutationEmitter,
  RadarrLibraryStatusOptions,
  RadarrLookupMovie,
  TitleIndexer,
} from './types';

export class RadarrStatus {
  constructor(
    private readonly store: RadarrLibraryStore,
    private readonly indexer: TitleIndexer,
    private readonly mapping: MappingResolver,
    private readonly radarr: RadarrClient,
    private readonly emitMutation?: RadarrLibraryMutationEmitter,
  ) {}

  async getMovieStatus(
    payload: CheckMovieStatusPayload,
    options: RadarrLibraryStatusOptions = {},
  ): Promise<CheckMovieStatusResponse> {
    if (import.meta.env.DEV) {
      const priority = options.priority ?? 'normal';
      const network = options.network ?? 'allow';
      console.debug(`[ani2arr | RadarrStatus] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`);
    }

    const leanList = await this.store.getLeanMovieList();
    const radarrOpts = await getExtensionOptionsSnapshot();
    const isConfigured = !!(radarrOpts?.providers.radarr.url && radarrOpts?.providers.radarr.apiKey);

    const normalizedTitle = payload.title?.trim();
    let tmdbId = this.indexer.findTmdbIdInIndex(payload);
    let successfulSynonym: string | undefined;
    let linkedAniListIds: number[] | undefined;

    if (tmdbId === null) {
      if (options.priority === 'high') {
        try {
          this.mapping.prioritizeAniListMedia?.(payload.anilistId, { schedule: false });
        } catch {
          // best-effort
        }
      }

      const mappingOptions: Parameters<MappingResolver['resolveExternalId']>[2] = {};
      if (!isConfigured || options.network === 'never') mappingOptions.network = 'never';
      if (options.ignoreFailureCache) {
        mappingOptions.ignoreFailureCache = true;
        mappingOptions.forceLookupNetwork = true;
      }
      if (options.priority) mappingOptions.priority = options.priority;
      if (options.force_verify) mappingOptions.forceLookupNetwork = true;

      const hints: NonNullable<NonNullable<typeof mappingOptions>['hints']> = {};
      if (normalizedTitle) hints.primaryTitle = normalizedTitle;
      if (payload.metadata) hints.domMedia = payload.metadata;
      if (Object.keys(hints).length > 0) mappingOptions.hints = hints;

      try {
        if (import.meta.env.DEV) {
          console.debug(
            `[ani2arr | RadarrStatus] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
          );
        }
        const mapping = await this.mapping.resolveExternalId('radarr', payload.anilistId, mappingOptions);
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
        logError(normalized, `RadarrStatus:getMovieStatus:${payload.anilistId}`);
        throw normalized;
      }
    }

    if (tmdbId === null) {
      if (import.meta.env.DEV) console.debug(`[ani2arr | RadarrStatus] status:result anilistId=${payload.anilistId} outcome=unresolved`);
      return { exists: false, tmdbId: null, externalId: null, anilistTmdbLinkMissing: true };
    }

    const linked = this.mapping.getLinkedAniListIds?.('radarr', { id: tmdbId, kind: 'tmdb' }) ?? [];
    if (linked.length > 0) {
      linkedAniListIds = linked;
    }

    const cachedMovie = leanList.find(movie => movie.tmdbId === tmdbId) ?? null;
    const existsInCache = cachedMovie !== null;

    if (!isConfigured || !options.force_verify) {
      const out: CheckMovieStatusResponse = {
        exists: existsInCache,
        tmdbId,
        externalId: { id: tmdbId, kind: 'tmdb' },
        ...(cachedMovie ? { movie: cachedMovie } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | RadarrStatus] status:result anilistId=${payload.anilistId} outcome=cached exists=${String(existsInCache)} tmdbId=${tmdbId}`);
      }
      return out;
    }

    const credentials = {
      url: radarrOpts!.providers.radarr.url,
      apiKey: radarrOpts!.providers.radarr.apiKey,
    };
    const liveMovie = await this.radarr.getMovieByTmdbId(tmdbId, credentials);
    let lookupMovie: RadarrLookupMovie | null = null;

    if (liveMovie) {
      let cacheMutated = false;
      if (!existsInCache) {
        await this.store.addMovieToCache(liveMovie);
        cacheMutated = true;
      }

      if (cacheMutated) {
        await notifyLibraryMutation('RadarrLibrary:notifyLibraryMutation', this.emitMutation, { tmdbId, action: 'added' });
      }

      const out: CheckMovieStatusResponse = {
        exists: true,
        tmdbId,
        externalId: { id: tmdbId, kind: 'tmdb' },
        movie: liveMovie,
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | RadarrStatus] status:result anilistId=${payload.anilistId} outcome=live exists=true tmdbId=${tmdbId}`);
      }
      return out;
    }

    try {
      lookupMovie = await this.radarr.lookupMovieByTmdbId(tmdbId, credentials);
    } catch (error) {
      logError(normalizeError(error), `RadarrStatus:getMovieStatus:lookup:${tmdbId}`);
    }

    if (existsInCache) {
      await this.store.removeMovieFromCache(tmdbId);
      await notifyLibraryMutation('RadarrLibrary:notifyLibraryMutation', this.emitMutation, { tmdbId, action: 'removed' });
    }

    const out: CheckMovieStatusResponse = {
      exists: false,
      tmdbId,
      externalId: { id: tmdbId, kind: 'tmdb' },
      ...(lookupMovie ? { movie: lookupMovie } : {}),
      ...(successfulSynonym ? { successfulSynonym } : {}),
      ...(linkedAniListIds ? { linkedAniListIds } : {}),
    };
    if (import.meta.env.DEV) {
      console.debug(`[ani2arr | RadarrStatus] status:result anilistId=${payload.anilistId} outcome=removed exists=false tmdbId=${tmdbId}`);
    }
    return out;
  }
}
