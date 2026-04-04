/** RPC handlers for extension options persistence and provider-default updates. */
// src/rpc/handlers/options.handlers.ts

import type { Ani2arrApi } from '@/rpc';
import {
  getExtensionOptionsSnapshot,
  setExtensionOptionsSnapshot,
  type ExtensionOptions,
} from '@/options';
import type { ApiHandlerDeps } from './handler-deps';

export function createOptionsHandlers(deps: ApiHandlerDeps): Pick<
  Ani2arrApi,
  'notifySettingsChanged' | 'updateSonarrDefaults' | 'updateRadarrDefaults'
> {
  const { handleOptionsUpdated } = deps;

  const handlers = {
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
  } satisfies Pick<
    Ani2arrApi,
    'notifySettingsChanged' | 'updateSonarrDefaults' | 'updateRadarrDefaults'
  >;

  return handlers;
}
