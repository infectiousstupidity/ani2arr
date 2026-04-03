/** Sonarr-backed library cache and status lookup logic for series records. */
// src/core/library/sonarr-library.ts

import type { SonarrClient } from '@/integrations/providers/sonarr.client';
import type { StatusInput } from '@/rpc/schemas';
import type { CheckSeriesStatusResponse } from '@/rpc/types';
import type { MappingService } from '@/services/mapping';
import { ErrorCode, logError, normalizeError } from '@/shared/errors';
import type { ExtensionOptions } from '@/shared/types';
import type { ProviderCredentials, SonarrLookupSeries, SonarrSeries, SonarrSeriesSnapshot } from '@/shared/types/providers';
import { getExtensionOptionsSnapshot } from '@/storage';
import { BaseProviderLibraryStore } from './base-provider-library.store';
import { notifyLibraryMutation } from './library-mutation';
import { SonarrLibraryIndexer } from './sonarr-library.indexer';
import type { LibraryMutationEmitter, LibraryStatusOptions, ProviderLibraryCaches } from './library.types';

const CACHE_KEY = 'sonarr:lean-series';

type SonarrLibraryMutationPayload = {
  tvdbId: number;
  action: 'added' | 'removed';
};

export class SonarrLibrary {
  private readonly indexer = new SonarrLibraryIndexer();
  private readonly store: BaseProviderLibraryStore<SonarrSeries, SonarrSeriesSnapshot, number>;

  constructor(
    private readonly sonarrClient: SonarrClient,
    private readonly mappingService: Pick<
      MappingService,
      'resolveTvdbId' | 'prioritizeAniListMedia' | 'getLinkedAniListIdsForTvdb'
    >,
    caches: ProviderLibraryCaches<SonarrSeriesSnapshot>,
    private readonly emitLibraryMutation?: LibraryMutationEmitter<SonarrLibraryMutationPayload>,
  ) {
    this.store = new BaseProviderLibraryStore(
      caches,
      this.indexer,
      {
        cacheKey: CACHE_KEY,
        getCredentials: (options) => {
          const { url, apiKey } = options.providers.sonarr;
          return url && apiKey ? { url, apiKey } : null;
        },
        fetchAll: async (credentials: ProviderCredentials) => {
          const full = await this.sonarrClient.getAllSeries(credentials);
          return full.filter(series => typeof series.tvdbId === 'number' && Number.isFinite(series.tvdbId));
        },
        toSnapshot: (series: SonarrSeries) => this.toSeriesSnapshot(series),
        getExternalId: (snapshot: SonarrSeriesSnapshot) => snapshot.tvdbId,
      },
      'SonarrLibraryStore',
    );
  }

  getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]> {
    return this.store.getLeanList();
  }

  refreshCache(optionsOverride?: ExtensionOptions): Promise<SonarrSeriesSnapshot[]> {
    return this.store.refreshCache(optionsOverride);
  }

  addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
    return this.store.addToCache(newSeries);
  }

  removeSeriesFromCache(tvdbId: number): Promise<void> {
    return this.store.removeFromCache(tvdbId);
  }

  async getSeriesStatus(
    payload: Pick<StatusInput, 'anilistId' | 'title' | 'metadata'>,
    options: LibraryStatusOptions = {},
  ): Promise<CheckSeriesStatusResponse> {
    if (import.meta.env.DEV) {
      const priority = options.priority ?? 'normal';
      const network = options.network ?? 'allow';
      console.debug(
        `[ani2arr | SonarrLibrary] status:start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
      );
    }

    const leanList = await this.store.getLeanList();
    const sonarrOptions = await getExtensionOptionsSnapshot();
    const isConfigured = Boolean(sonarrOptions?.providers.sonarr.url && sonarrOptions?.providers.sonarr.apiKey);

    const normalizedTitle = payload.title?.trim();
    let tvdbId = this.indexer.findTvdbIdInIndex(payload);
    let successfulSynonym: string | undefined;
    let linkedAniListIds: number[] | undefined;

    if (tvdbId === null) {
      if (options.priority === 'high') {
        try {
          this.mappingService.prioritizeAniListMedia?.(payload.anilistId, { schedule: false });
        } catch {
          // best-effort
        }
      }

      const mappingOptions: Parameters<MappingService['resolveTvdbId']>[1] = {};
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
            `[ani2arr | SonarrLibrary] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`,
          );
        }

        const mapping = await this.mappingService.resolveTvdbId(payload.anilistId, mappingOptions);
        if (mapping) {
          tvdbId = mapping.tvdbId;
          successfulSynonym = mapping.successfulSynonym;
        }
      } catch (error) {
        const normalized = normalizeError(error);
        if (
          normalized.code === ErrorCode.CONFIGURATION_ERROR ||
          normalized.code === ErrorCode.SONARR_NOT_CONFIGURED ||
          (normalized.code === ErrorCode.VALIDATION_ERROR && normalized.details?.reason === 'network-disabled')
        ) {
          return { exists: false, tvdbId: null, externalId: null, anilistTvdbLinkMissing: true };
        }
        logError(normalized, `SonarrLibrary:getSeriesStatus:${payload.anilistId}`);
        throw normalized;
      }
    }

    if (tvdbId === null) {
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | SonarrLibrary] status:result anilistId=${payload.anilistId} outcome=unresolved`);
      }
      return { exists: false, tvdbId: null, externalId: null, anilistTvdbLinkMissing: true };
    }

    const linked = this.mappingService.getLinkedAniListIdsForTvdb?.(tvdbId) ?? [];
    if (linked.length > 0) {
      linkedAniListIds = linked;
    }

    const cachedSeries = leanList.find(series => series.tvdbId === tvdbId) ?? null;
    const existsInCache = cachedSeries !== null;

    if (!isConfigured || !options.force_verify) {
      return {
        exists: existsInCache,
        tvdbId,
        externalId: { id: tvdbId, kind: 'tvdb' },
        ...(cachedSeries ? { series: cachedSeries } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
    }

    const credentials = {
      url: sonarrOptions!.providers.sonarr.url,
      apiKey: sonarrOptions!.providers.sonarr.apiKey,
    };
    const liveSeries = await this.sonarrClient.getSeriesByTvdbId(tvdbId, credentials);
    let lookupSeries: SonarrLookupSeries | null = null;

    if (liveSeries) {
      let cacheMutated = false;
      if (!existsInCache) {
        await this.store.addToCache(liveSeries);
        cacheMutated = true;
      }

      if (cacheMutated) {
        await notifyLibraryMutation('SonarrLibrary:notifyLibraryMutation', this.emitLibraryMutation, {
          tvdbId,
          action: 'added',
        });
      }

      return {
        exists: true,
        tvdbId,
        externalId: { id: tvdbId, kind: 'tvdb' },
        series: liveSeries,
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
    }

    try {
      lookupSeries = await this.sonarrClient.lookupSeriesByTvdbId(tvdbId, credentials);
    } catch (error) {
      logError(normalizeError(error), `SonarrLibrary:getSeriesStatus:lookup:${tvdbId}`);
    }

    if (existsInCache) {
      await this.store.removeFromCache(tvdbId);
      await notifyLibraryMutation('SonarrLibrary:notifyLibraryMutation', this.emitLibraryMutation, {
        tvdbId,
        action: 'removed',
      });
    }

    return {
      exists: false,
      tvdbId,
      externalId: { id: tvdbId, kind: 'tvdb' },
      ...(lookupSeries ? { series: lookupSeries } : {}),
      ...(successfulSynonym ? { successfulSynonym } : {}),
      ...(linkedAniListIds ? { linkedAniListIds } : {}),
    };
  }

  private toSeriesSnapshot(series: SonarrSeries): SonarrSeriesSnapshot {
    const alternateTitles = Array.isArray(series.alternateTitles)
      ? (series.alternateTitles.map(title => title?.title?.trim()).filter(Boolean) as string[])
      : [];

    const statistics = series.statistics
      ? {
          ...(typeof series.statistics.episodeCount === 'number'
            ? { episodeCount: series.statistics.episodeCount }
            : {}),
          ...(typeof series.statistics.episodeFileCount === 'number'
            ? { episodeFileCount: series.statistics.episodeFileCount }
            : {}),
          ...(typeof series.statistics.totalEpisodeCount === 'number'
            ? { totalEpisodeCount: series.statistics.totalEpisodeCount }
            : {}),
        }
      : undefined;

    return {
      tvdbId: series.tvdbId,
      id: series.id,
      titleSlug: series.titleSlug,
      title: series.title,
      ...(alternateTitles.length > 0 ? { alternateTitles } : {}),
      ...(statistics ? { statistics } : {}),
    };
  }
}
