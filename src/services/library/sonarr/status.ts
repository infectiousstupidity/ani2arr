// src/services/library/sonarr/status.ts
import type {
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  MappingResolver,
  TitleIndexer,
  SonarrClient,
  RequestPriority,
} from './types';
import { getExtensionOptionsSnapshot } from '@/shared/utils/storage';
import { ErrorCode, logError, normalizeError } from '@/shared/utils/error-handling';
import { notifyLibraryMutation, type LibraryMutationEmitter } from './notify';
import type { SonarrLibraryStore } from './store';

export class SonarrStatus {
  constructor(
    private readonly store: SonarrLibraryStore,
    private readonly indexer: TitleIndexer,
    private readonly mapping: MappingResolver,
    private readonly sonarr: SonarrClient,
    private readonly emitMutation?: LibraryMutationEmitter
  ) {}

  async getSeriesStatus(
    payload: CheckSeriesStatusPayload,
    options: { force_verify?: boolean; network?: 'never'; ignoreFailureCache?: boolean; priority?: RequestPriority } = {}
  ): Promise<CheckSeriesStatusResponse> {
    if (import.meta.env.DEV) {
      const pr = options.priority ?? 'normal';
      const net = options.network ?? 'allow';
      console.debug(`[ani2arr | SonarrStatus] status:start anilistId=${payload.anilistId} priority=${pr} network=${net} force_verify=${String(options.force_verify === true)}`);
    }

    const leanList = await this.store.getLeanSeriesList();
    const sonarrOpts = await getExtensionOptionsSnapshot();
    const isConfigured = !!(sonarrOpts?.sonarrUrl && sonarrOpts?.sonarrApiKey);

    const normalizedTitle = payload.title?.trim();
    let tvdbId = this.indexer.findTvdbIdInIndex(payload);
    let successfulSynonym: string | undefined;

    if (tvdbId === null) {
      if (options.priority === 'high') {
        try {
          this.mapping.prioritizeAniListMedia?.(payload.anilistId, { schedule: false });
        } catch {
          // best-effort
        }
      }

      const mappingOptions: Parameters<MappingResolver['resolveTvdbId']>[1] = {};
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
            `[ani2arr | SonarrStatus] status:lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? 'normal'} network=${options.network ?? 'allow'} ignoreFailureCache=${String(options.ignoreFailureCache === true)}`
          );
        }
        const mapping = await this.mapping.resolveTvdbId(payload.anilistId, mappingOptions);
        if (mapping) {
          tvdbId = mapping.tvdbId;
          successfulSynonym = mapping.successfulSynonym;
        }
      } catch (error) {
        const normalized = normalizeError(error);
        if (normalized.code === ErrorCode.CONFIGURATION_ERROR) {
          return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
        }
        logError(normalized, `SonarrStatus:getSeriesStatus:${payload.anilistId}`);
        throw normalized;
      }
    }

    if (tvdbId === null) {
      if (import.meta.env.DEV) console.debug(`[ani2arr | SonarrStatus] status:result anilistId=${payload.anilistId} outcome=unresolved`);
      return { exists: false, tvdbId: null, anilistTvdbLinkMissing: true };
    }

    const cachedSeries = leanList.find(s => s.tvdbId === tvdbId) ?? null;
    const existsInCache = cachedSeries !== null;

    if (!isConfigured || !options.force_verify) {
      const out: CheckSeriesStatusResponse = {
        exists: existsInCache,
        tvdbId,
        ...(cachedSeries ? { series: cachedSeries } : {}),
        ...(successfulSynonym ? { successfulSynonym } : {}),
      };
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | SonarrStatus] status:result anilistId=${payload.anilistId} outcome=cached exists=${String(existsInCache)} tvdbId=${tvdbId}`);
      }
      return out;
    }

    const credentials = { url: sonarrOpts!.sonarrUrl!, apiKey: sonarrOpts!.sonarrApiKey! };
    const liveSeries = await this.sonarr.getSeriesByTvdbId(tvdbId, credentials);

    if (liveSeries) {
      let cacheMutated = false;
      if (!existsInCache) {
        await this.store.addSeriesToCache(liveSeries);
        cacheMutated = true;
      }

      if (cacheMutated) {
        await notifyLibraryMutation(this.emitMutation, { tvdbId, action: 'added' });
      }

      // When force_verify is true and we have live data, return the full series object
      // so the UI can display rich metadata (images, network, etc.)
      const out2: CheckSeriesStatusResponse = {
        exists: true,
        tvdbId,
        series: liveSeries,
        ...(successfulSynonym ? { successfulSynonym } : {}),
      };
      if (import.meta.env.DEV) {
        console.debug(`[ani2arr | SonarrStatus] status:result anilistId=${payload.anilistId} outcome=live exists=true tvdbId=${tvdbId}`);
      }
      return out2;
    }

    if (existsInCache) {
      await this.store.removeSeriesFromCache(tvdbId);
      await notifyLibraryMutation(this.emitMutation, { tvdbId, action: 'removed' });
    }

    const out3: CheckSeriesStatusResponse = {
      exists: false,
      tvdbId,
      ...(successfulSynonym ? { successfulSynonym } : {}),
    };
    if (import.meta.env.DEV) {
      console.debug(`[ani2arr | SonarrStatus] status:result anilistId=${payload.anilistId} outcome=removed exists=false tvdbId=${tvdbId}`);
    }
    return out3;
  }
}