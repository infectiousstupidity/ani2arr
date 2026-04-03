/** RPC handlers for AniList media fetch, search, and metadata flows. */
// src/rpc/handlers/anilist.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import type { AniListSearchResult } from '@/rpc/types';
import { normalizeError } from '@/shared/errors';
import type { AniListMedia } from '@/shared/schemas/anilist/anilist-media.schema';
import type { ApiHandlerDeps } from './handler-deps';

type AniListHandlerMethods = Pick<
  Ani2arrApi,
  | 'prefetchAniListMedia'
  | 'fetchAniListMedia'
  | 'searchAniList'
  | 'getAniListMetadata'
  | 'getAniListSchedulerDebug'
>;

export function createAnilistHandlers(deps: ApiHandlerDeps): AniListHandlerMethods {
  const { anilistMediaService, anilistMetadataStore } = deps;

  const handlers: AniListHandlerMethods = {
    async prefetchAniListMedia(ids) {
      const map = await anilistMediaService.fetchMediaBatch(ids, {
        priority: 'low',
        source: 'browse-prefetch',
      });
      return Array.from(map.entries()) as Array<[number, AniListMedia]>;
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

    async searchAniList(input) {
      try {
        const request = typeof input.limit === 'number' ? { limit: input.limit } : {};
        const results = await anilistMediaService.searchMedia(input.search, request);
        return results.map((result): AniListSearchResult => ({
          id: result.id,
          title: result.title ?? {},
          coverImage: result.coverImage ?? null,
          format: result.format ?? null,
          status: result.status ?? null,
        }));
      } catch (error) {
        throw normalizeError(error);
      }
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
        ...(input?.maxBatch !== undefined ? { maxBatch: input.maxBatch } : {}),
      });

      return {
        metadata: result.metadata,
        ...(result.missingIds?.length ? { missingIds: result.missingIds } : {}),
      };
    },

    async getAniListSchedulerDebug() {
      return anilistMediaService.getSchedulerDebugSnapshot();
    },
  };

  return handlers;
}
