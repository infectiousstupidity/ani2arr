/** RPC handlers for mapping resolution, overrides, exports, and mapping listings. */
// src/rpc/handlers/mapping.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import type { StatusInput } from '@/rpc/schemas';
import { getExtensionOptionsSnapshot, isProviderConfigured } from '@/options';
import { createError, ErrorCode } from '@/shared/errors';
import { listMappings } from '@/mapping/review/list-mappings';
import { exportStoredMappings } from '@/mapping/overrides/export-stored-mappings';
import type { ApiHandlerDeps } from './handler-deps';

export function createMappingHandlers(deps: ApiHandlerDeps): Pick<
  Ani2arrApi,
  | 'resolveMapping'
  | 'getStaticMapped'
  | 'initMappings'
  | 'setMappingOverride'
  | 'clearMappingOverride'
  | 'setMappingIgnore'
  | 'clearMappingIgnore'
  | 'setMappingRejectedCandidate'
  | 'clearMappingRejectedCandidate'
  | 'getMappingOverrides'
  | 'clearAllMappingOverrides'
  | 'exportStoredMappings'
  | 'getMappings'
> {
  const {
    mappingService,
    overridesService,
    upstreamMappingStore,
    sonarrLibrary,
    radarrLibrary,
    overridesReady,
    ensureSonarrConfigured,
    scheduleLibraryRefresh,
    bumpLibraryRevision,
    bumpMappingsRevision,
  } = deps;

  const handlers = {
    async resolveMapping(input) {
      await ensureSonarrConfigured();
      await overridesReady;

      try {
        const payload: Pick<StatusInput, 'anilistId' | 'title' | 'metadata'> = { anilistId: input.anilistId };
        if (input.primaryTitleHint !== undefined) payload.title = input.primaryTitleHint;
        if (input.metadata !== undefined) payload.metadata = input.metadata ?? null;
        const status = await sonarrLibrary.getSeriesStatus(payload, { network: 'never', ignoreFailureCache: true });
        if (status.exists && typeof status.tvdbId === 'number') {
          return {
            tvdbId: status.tvdbId,
            ...(status.successfulSynonym ? { successfulSynonym: status.successfulSynonym } : {}),
          };
        }
      } catch {
        // ignore fast-path errors
      }

      const resolveOptions: Parameters<typeof mappingService.resolveTvdbId>[1] = {};
      const hints: NonNullable<Parameters<typeof mappingService.resolveTvdbId>[1]>['hints'] = {};
      if (input.primaryTitleHint) hints.primaryTitle = input.primaryTitleHint;
      if (input.metadata) hints.domMedia = input.metadata;
      if (Object.keys(hints).length > 0) resolveOptions.hints = hints;

      const mapping = await mappingService.resolveTvdbId(input.anilistId, resolveOptions);
      return {
        tvdbId: mapping ? mapping.tvdbId : null,
        ...(mapping?.successfulSynonym ? { successfulSynonym: mapping.successfulSynonym } : {}),
      };
    },

    async getStaticMapped(ids) {
      await mappingService.initStaticPairs();
      const hits: number[] = [];
      for (const id of ids) {
        const hit = upstreamMappingStore.get(id);
        if (hit) hits.push(id);
      }
      return hits;
    },

    initMappings() {
      return mappingService.initStaticPairs();
    },

    async setMappingOverride(input) {
      await overridesReady;

      if (input.provider === 'sonarr') {
        const linkedIds = new Set<number>(overridesService.getLinkedAniListIds('sonarr', input.providerId));
        for (const id of upstreamMappingStore.getAniListIdsForTvdb(input.providerId)) {
          linkedIds.add(id);
        }
        const conflictingAniListIds = [...linkedIds].filter(id => id !== input.anilistId);
        if (conflictingAniListIds.length > 0 && input.force !== true) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            `TVDB ID ${input.providerId} is already linked to other AniList entries.`,
            'This TVDB ID is already linked to other AniList entries. Confirm if you want to share it.',
            { conflictingAniListIds },
          );
        }
      }

      await overridesService.set(input.provider, input.anilistId, input.providerId);
      await mappingService.evictResolved(input.anilistId, input.provider);

      if (input.provider === 'sonarr') {
        const options = await getExtensionOptionsSnapshot();
        if (isProviderConfigured(options, 'sonarr')) {
          scheduleLibraryRefresh('sonarr', options);
        }
      }

      await bumpLibraryRevision(input.provider);
      await bumpMappingsRevision();
      return { ok: true as const };
    },

    async clearMappingOverride(input) {
      await overridesReady;
      await overridesService.clear(input.provider, input.anilistId);
      await mappingService.evictResolved(input.anilistId, input.provider);

      if (input.provider === 'sonarr') {
        const options = await getExtensionOptionsSnapshot();
        if (isProviderConfigured(options, 'sonarr')) {
          scheduleLibraryRefresh('sonarr', options);
        }
      }

      await bumpLibraryRevision(input.provider);
      await bumpMappingsRevision();
      return { ok: true as const };
    },

    async setMappingIgnore(input) {
      await overridesReady;
      await overridesService.setIgnore(input.provider, input.anilistId);
      await mappingService.evictResolved(input.anilistId, input.provider);
      await bumpLibraryRevision(input.provider);
      await bumpMappingsRevision();
      return { ok: true as const };
    },

    async clearMappingIgnore(input) {
      await overridesReady;
      await overridesService.clearIgnore(input.provider, input.anilistId);
      await mappingService.evictResolved(input.anilistId, input.provider);
      await bumpLibraryRevision(input.provider);
      await bumpMappingsRevision();
      return { ok: true as const };
    },

    async setMappingRejectedCandidate(input) {
      await overridesReady;
      await overridesService.setRejectedCandidate(input.provider, input.anilistId, input.providerId);
      await mappingService.evictResolved(input.anilistId, input.provider);

      await bumpLibraryRevision(input.provider);
      await bumpMappingsRevision();
      return { ok: true as const };
    },

    async clearMappingRejectedCandidate(input) {
      await overridesReady;
      await overridesService.clearRejectedCandidate(input.provider, input.anilistId, input.providerId);
      await mappingService.evictResolved(input.anilistId, input.provider);

      await bumpLibraryRevision(input.provider);
      await bumpMappingsRevision();
      return { ok: true as const };
    },

    async getMappingOverrides() {
      await overridesReady;
      return overridesService.list();
    },

    async clearAllMappingOverrides() {
      await overridesReady;
      const snapshot = overridesService.exportState();
      const existing = overridesService.list();
      const existingIgnores = overridesService.listIgnores();

      try {
        await overridesService.clearAll();
        await Promise.all(existing.map(entry => mappingService.evictResolved(entry.anilistId, entry.provider)));
        await Promise.all(existingIgnores.map(entry => mappingService.evictResolved(entry.anilistId, entry.provider)));

        const options = await getExtensionOptionsSnapshot();
        if (isProviderConfigured(options, 'sonarr')) {
          scheduleLibraryRefresh('sonarr', options);
        }

        await bumpLibraryRevision('sonarr');
        await bumpLibraryRevision('radarr');
        await bumpMappingsRevision();

        return { ok: true as const };
      } catch (error) {
        try {
          await overridesService.importState(snapshot);
        } catch (restoreError) {
          throw createError(
            ErrorCode.STORAGE_ERROR,
            'Failed to clear stored mappings, and rollback failed.',
            'Failed to clear stored mappings, and the previous mapping state could not be restored.',
            { cause: restoreError },
          );
        }

        throw error;
      }
    },

    async exportStoredMappings() {
      await overridesReady;
      return exportStoredMappings(overridesService);
    },

    async getMappings(input) {
      await overridesReady;
      await mappingService.initStaticPairs();
      return listMappings(input, {
        overridesService,
        upstreamMappingStore,
        sonarrLibrary,
        radarrLibrary,
      });
    },
  } satisfies Pick<
    Ani2arrApi,
    | 'resolveMapping'
    | 'getStaticMapped'
    | 'initMappings'
    | 'setMappingOverride'
    | 'clearMappingOverride'
    | 'setMappingIgnore'
    | 'clearMappingIgnore'
    | 'setMappingRejectedCandidate'
    | 'clearMappingRejectedCandidate'
    | 'getMappingOverrides'
    | 'clearAllMappingOverrides'
    | 'exportStoredMappings'
    | 'getMappings'
  >;

  return handlers;
}
