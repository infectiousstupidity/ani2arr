/** Sonarr-backed library cache and status lookup logic for series records. */
// src/providers/library/sonarr-library.ts

import type { SonarrClient } from '@/providers/clients/sonarr.client';
import type { StatusInput } from '@/rpc/schemas';
import type { CheckSeriesStatusResponse } from '@/rpc/types';
import type { MappingService } from '@/mapping/mapping.service';
import type { MappingOverridesService } from '@/mapping/overrides';
import type { UpstreamMappingStore } from '@/mapping/upstream';
import { ErrorCode, logError, normalizeError } from '@/shared/errors';
import { getExtensionOptionsSnapshot, getProviderCredentials, isProviderConfigured, type ExtensionOptions } from '@/options';
import type { ProviderCredentials, SonarrLookupSeries, SonarrSeries, SonarrSeriesSnapshot } from '@/providers';
import { BaseProviderLibraryStore } from './base-provider-library.store';
import { notifyLibraryMutation } from './notify-library-mutation';
import { SonarrLibraryIndexer } from './sonarr-library.indexer';
import type { LibraryMutationEmitter, LibraryStatusOptions, ProviderLibraryCaches } from './types';

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
    private readonly mappingService: Pick<MappingService, 'resolveTvdbId' | 'prioritizeAniListMedia'>,
    private readonly overridesService: Pick<MappingOverridesService, 'getLinkedAniListIds'>,
    private readonly upstreamMappingStore: Pick<UpstreamMappingStore, 'getAniListIdsForTvdb'>,
    caches: ProviderLibraryCaches<SonarrSeriesSnapshot>,
    private readonly emitLibraryMutation?: LibraryMutationEmitter<SonarrLibraryMutationPayload>,
  ) {
    this.store = new BaseProviderLibraryStore(
      caches,
      this.indexer,
      {
        cacheKey: CACHE_KEY,
        getCredentials: (options) => getProviderCredentials(options, 'sonarr'),
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
    const isConfigured = isProviderConfigured(sonarrOptions, 'sonarr');

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
          return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
        }
        logError(normalized, `SonarrLibrary:getSeriesStatus:${payload.anilistId}`);
        throw normalized;
      }
    }

    if (tvdbId === null) {
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | SonarrLibrary] status:result anilistId=${payload.anilistId} outcome=unresolved`);
      }
      return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
    }

    const linked = new Set<number>(this.overridesService.getLinkedAniListIds('sonarr', tvdbId));
    for (const id of this.upstreamMappingStore.getAniListIdsForTvdb(tvdbId)) {
      linked.add(id);
    }
    if (linked.size > 0) {
      linkedAniListIds = [...linked];
    }

    const cachedSeries = leanList.find(series => series.tvdbId === tvdbId) ?? null;
    const existsInCache = cachedSeries !== null;

    if (!isConfigured || !options.force_verify) {
      return {
        exists: existsInCache,
        tvdbId,
        ...(cachedSeries ? { series: cachedSeries } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
        ...(linkedAniListIds ? { linkedAniListIds } : {}),
      };
    }

    const credentials = getProviderCredentials(sonarrOptions, 'sonarr')!;
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
      ...(lookupSeries ? { series: lookupSeries } : {}),
      ...(successfulSynonym ? { successfulSynonym } : {}),
      ...(linkedAniListIds ? { linkedAniListIds } : {}),
    };
  }

  private toSeriesSnapshot(series: SonarrSeries): SonarrSeriesSnapshot {
    const alternateTitles = Array.isArray(series.alternateTitles)
      ? series.alternateTitles
          .map(entry => entry?.title?.trim())
          .filter((value): value is string => value !== undefined && value !== '')
      : undefined;
    const statistics = series.statistics
      ? {
          ...(series.statistics.episodeCount === undefined
            ? {}
            : { episodeCount: series.statistics.episodeCount }),
          ...(series.statistics.episodeFileCount === undefined
            ? {}
            : { episodeFileCount: series.statistics.episodeFileCount }),
          ...(series.statistics.totalEpisodeCount === undefined
            ? {}
            : { totalEpisodeCount: series.statistics.totalEpisodeCount }),
        }
      : undefined;

    return {
      id: series.id,
      tvdbId: series.tvdbId,
      title: series.title,
      titleSlug: series.titleSlug,
      ...(alternateTitles === undefined ? {} : { alternateTitles }),
      ...(statistics === undefined ? {} : { statistics }),
    };
  }
}
