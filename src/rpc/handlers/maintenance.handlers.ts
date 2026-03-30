/** RPC handlers for cache clearing and full extension reset workflows. */
// src/rpc/handlers/maintenance.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import type { ApiHandlerDeps } from './handler-deps';

type MaintenanceHandlerMethods = Pick<
  Ani2arrApi,
  'clearPersistentCaches' | 'resetExtensionState'
>;

export function createMaintenanceHandlers(deps: ApiHandlerDeps): MaintenanceHandlerMethods {
  const {
    clearPersistentCaches: clearPersistentCachesWorkflow,
    resetExtensionState: resetExtensionStateWorkflow,
  } = deps;

  const handlers: MaintenanceHandlerMethods = {
    async clearPersistentCaches() {
      await clearPersistentCachesWorkflow();
      return { ok: true as const };
    },

    async resetExtensionState() {
      await resetExtensionStateWorkflow();
      return { ok: true as const };
    },
  };

  return handlers;
}
