// src/services/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import { SonarrApiService } from '@/api/sonarr.api';
import { AnilistApiService } from '@/api/anilist.api';
import { MappingService } from './mapping.service';
import { LibraryService } from './library.service';
import { extensionOptions } from '@/utils/storage';
import { ResolveInput, MappingOutput, StatusInput, StatusOutput, AddInput } from '@/rpc/schemas';
import type { ExtensionOptions, LeanSonarrSeries } from '@/types';

function bindAll<T extends object>(instance: T): T {
  const proto = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
  if (!proto) return instance;
  const target = instance as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== 'constructor' && typeof (proto as any)[key] === 'function') {
      target[key] = (proto as any)[key].bind(instance);
    }
  }
  return instance;
}

type KitsunarrApi = {
  resolveMapping(input: unknown): Promise<unknown>;
  getSeriesStatus(input: unknown): Promise<unknown>;
  addToSonarr(input: unknown): Promise<{ ok: true }>;
  removeFromSonarr(input: { tvdbId: number }): Promise<{ ok: true }>;
  notifySettingsChanged(): Promise<{ ok: true }>;
  initStaticMappings(): Promise<{ ok: true }>;
  refreshLibraryCache(options?: ExtensionOptions): Promise<LeanSonarrSeries[]>;
};

export const [registerKitsunarrApi, getKitsunarrApi] =
  defineProxyService<KitsunarrApi, []>('KitsunarrApi', () => {
    const sonarr = bindAll(new SonarrApiService());
    const anilist = bindAll(new AnilistApiService());
    // Updated constructors to match the new services
    const mapping = bindAll(new MappingService(sonarr, anilist));
    const library = bindAll(new LibraryService(sonarr, mapping));

    async function ensureConfigured() {
      const opts = await extensionOptions.getValue();
      if (!opts?.sonarrUrl || !opts?.sonarrApiKey) {
        throw new Error('SONARR_NOT_CONFIGURED');
      }
      return opts;
    }

    async function broadcast(topic: string, payload?: unknown) {
      chrome.runtime.sendMessage({ _kitsunarr: true, topic, payload });
    }

    return {
      async resolveMapping(input) {
        // Enforce your rule: no lookups unless Sonarr is configured
        await ensureConfigured();
        const { anilistId } = ResolveInput.parse(input);
        const res = await mapping.resolveTvdbId(anilistId);
        return MappingOutput.parse(res);
      },

      async getSeriesStatus(input) {
        // Enforce configuration before any network work. LibraryService will still
        // respect network:'never' if your StatusInput encodes that policy.
        await ensureConfigured();
        const payload = StatusInput.parse(input); // expect { anilistId, title?, force_verify?, network?, ignoreFailureCache? }
        const res = await library.getSeriesStatus(
          { anilistId: payload.anilistId, title: payload.title },
          {
            force_verify: payload.force_verify,
            network: payload.network,
            ignoreFailureCache: payload.ignoreFailureCache,
          },
        );
        return StatusOutput.parse(res);
      },

      async addToSonarr(input) {
        const { tvdbId, profileId, path } = AddInput.parse(input);
        const opts = await ensureConfigured();
        await sonarr.addSeries({
          tvdbId,
          profileId,
          path,
          baseUrl: opts.sonarrUrl,
          apiKey: opts.sonarrApiKey,
        });
        // Invalidate and notify UIs
        await library.refreshCache(opts);
        await broadcast('series-updated', { tvdbId });
        return { ok: true };
      },

      async removeFromSonarr({ tvdbId }) {
        const opts = await ensureConfigured();
        await sonarr.deleteSeries({
          tvdbId,
          baseUrl: opts.sonarrUrl,
          apiKey: opts.sonarrApiKey,
        });
        await library.refreshCache(opts);
        await broadcast('series-updated', { tvdbId });
        return { ok: true };
      },

      async notifySettingsChanged() {
        await broadcast('settings-changed');
        return { ok: true };
      },

      async initStaticMappings() {
        await mapping.initStaticPairs();
        return { ok: true };
      },

      async refreshLibraryCache(options) {
        const result = await library.refreshCache(options);
        return result;
      },
    };
  });
