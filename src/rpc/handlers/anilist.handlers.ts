/** RPC handlers for AniList media fetch, search, and metadata flows. */
// src/rpc/handlers/anilist.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import type { ApiHandlerDeps } from './handler-deps';

export function createAnilistHandlers(deps: ApiHandlerDeps): Pick<
  Ani2arrApi,
  | 'prefetchAniListMedia'
  | 'fetchAniListMedia'
  | 'getAniListMetadata'
> {
  const { anilistMediaService, anilistMetadataStore } = deps;

  const handlers = {
    async prefetchAniListMedia(ids) {
      const map = await anilistMediaService.fetchMediaBatch(ids, {
        priority: 'low',
        source: 'browse-prefetch',
      });
      return [...map.entries()] as Array<[number, AniListMedia]>;
    },

    async fetchAniListMedia(anilistId) {
      if (typeof anilistId !== 'number' || !Number.isFinite(anilistId) || anilistId <= 0) {
        return null;
      }
      const media = await anilistMediaService.fetchMediaWithRelations(anilistId, {
        priority: 'high',
        source: 'media-modal',
      });
      return media ?? null;
    },

    async getAniListMetadata(input) {
      const ids = Array.isArray(input?.ids) ? input.ids : [];
      const normalizedIds = ids.filter(id => typeof id === 'number' && Number.isFinite(id) && id > 0);

      if (normalizedIds.length === 0) {
        return { metadata: [], missingIds: [] };
      }

      const result = await anilistMetadataStore.getMetadata(normalizedIds, {
        refreshStale: input?.refreshStale ?? true,
        fetchMissing: input?.fetchMissing ?? true,
        ...(typeof input?.maxBatch === 'number' ? { maxBatch: input.maxBatch } : {}),
      });

      return {
        metadata: result.metadata,
        ...(Array.isArray(result.missingIds) && result.missingIds.length > 0
          ? { missingIds: result.missingIds }
          : {}),
      };
    },

  } satisfies Pick<
    Ani2arrApi,
    | 'prefetchAniListMedia'
    | 'fetchAniListMedia'
    | 'getAniListMetadata'
  >;

  return handlers;
}
