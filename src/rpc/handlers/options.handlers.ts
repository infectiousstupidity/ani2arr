/** RPC handlers for extension options persistence and provider-default updates. */
// src/rpc/handlers/options.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import {
  getExtensionOptionsSnapshot,
  setExtensionOptionsSnapshot,
} from '@/storage';
import type { ExtensionOptions } from '@/shared/types';
import type { ApiHandlerDeps } from './handler-deps';

type OptionsHandlerMethods = Pick<
  Ani2arrApi,
  'notifySettingsChanged' | 'updateSonarrDefaults' | 'updateRadarrDefaults'
>;

export function createOptionsHandlers(deps: ApiHandlerDeps): OptionsHandlerMethods {
  const { handleOptionsUpdated } = deps;

  const handlers: OptionsHandlerMethods = {
    async notifySettingsChanged() {
      const options = await getExtensionOptionsSnapshot();
      await handleOptionsUpdated(options);
      return { ok: true as const };
    },

    async updateSonarrDefaults(defaults) {
      const current = await getExtensionOptionsSnapshot();
      const next: ExtensionOptions = {
        ...current,
        providers: {
          ...current.providers,
          sonarr: {
            ...current.providers.sonarr,
            defaults,
          },
        },
      };
      await setExtensionOptionsSnapshot(next);
      await handleOptionsUpdated(next);
      return { ok: true as const };
    },

    async updateRadarrDefaults(defaults) {
      const current = await getExtensionOptionsSnapshot();
      const next: ExtensionOptions = {
        ...current,
        providers: {
          ...current.providers,
          radarr: {
            ...current.providers.radarr,
            defaults,
          },
        },
      };
      await setExtensionOptionsSnapshot(next);
      await handleOptionsUpdated(next);
      return { ok: true as const };
    },
  };

  return handlers;
}
