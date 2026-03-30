/** RPC handlers for cache clearing and full extension reset workflows. */
// src/rpc/handlers/maintenance.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import { createDefaultSettings } from '@/shared/schemas/settings';
import { logError, normalizeError } from '@/shared/errors';
import type { ExtensionOptions } from '@/shared/types';
import {
  clearAllTtlCaches,
  getExtensionOptionsSnapshot,
  resetAllRevisions,
  setExtensionOptionsSnapshot,
} from '@/storage';
import { removeProviderHostPermission } from '@/runtime/permissions/provider-host-permissions';
import type { ApiHandlerDeps } from './handler-deps';

type MaintenanceHandlerMethods = Pick<
  Ani2arrApi,
  'clearPersistentCaches' | 'resetExtensionState'
>;

export function createMaintenanceHandlers(deps: ApiHandlerDeps): MaintenanceHandlerMethods {
  const {
    SonarrClient,
    RadarrClient,
    mappingService,
    overridesService,
    upstreamMappingStore,
    anilistMetadataStore,
    overridesReady,
  } = deps;

  const clearPersistentCachesInternal = async (): Promise<void> => {
    SonarrClient.clearEtagCache();
    RadarrClient.clearEtagCache();

    await Promise.all([
      anilistMetadataStore.clearLocalCache(),
      mappingService.resetLookupState(),
      upstreamMappingStore.clear(),
    ]);

    await clearAllTtlCaches();
    await resetAllRevisions();
  };

  const removeProviderHostPermissions = async (options: ExtensionOptions): Promise<void> => {
    const removals = [
      { provider: 'sonarr' as const, url: options.providers.sonarr.url },
      { provider: 'radarr' as const, url: options.providers.radarr.url },
    ];

    await Promise.all(removals.map(async ({ provider, url }) => {
      if (!url) return;

      const removal = await removeProviderHostPermission(String(url));
      if (!removal.ok) {
        logError(normalizeError(removal.error), `Ani2arrApi:resetExtensionState:${provider}:removePermission`);
        return;
      }

      if (!removal.value.removed) {
        logError(
          normalizeError(new Error(`Permission removal rejected for ${removal.value.pattern}.`)),
          `Ani2arrApi:resetExtensionState:${provider}:removePermission`,
        );
      }
    }));
  };

  const handlers: MaintenanceHandlerMethods = {
    async clearPersistentCaches() {
      await clearPersistentCachesInternal();
      return { ok: true as const };
    },

    async resetExtensionState() {
      await overridesReady;

      const previousOptions = await getExtensionOptionsSnapshot();
      const defaults = createDefaultSettings() as ExtensionOptions;

      await overridesService.clearAll();
      await clearPersistentCachesInternal();
      await setExtensionOptionsSnapshot(defaults);
      await removeProviderHostPermissions(previousOptions);

      return { ok: true as const };
    },
  };

  return handlers;
}
