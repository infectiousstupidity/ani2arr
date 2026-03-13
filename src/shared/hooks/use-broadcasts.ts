// src/hooks/use-broadcasts.ts
import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import type { MappingProvider } from '@/shared/types';
import { logger } from '@/shared/utils/logger';
import { queryKeys } from '@/shared/queries';

const log = logger.create('Broadcasts');

const PUBLIC_OPTIONS_KEY = queryKeys.publicOptions();
const SETTINGS_SESSION_KEY = 'a2a_settings_epoch';
const MAPPINGS_SESSION_KEY = 'a2a_mappings_epoch';
const LIBRARY_SESSION_KEYS: Record<MappingProvider, string> = {
  sonarr: 'a2a_library_epoch_sonarr',
  radarr: 'a2a_library_epoch_radarr',
};

export function useA2aBroadcasts(): void {
  const queryClient = useQueryClient();

  const refreshSettingsQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PUBLIC_OPTIONS_KEY });
  }, [queryClient]);

  const refreshMappingsQueries = useCallback(
    (epoch?: number) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
      if (typeof epoch === 'number') {
        sessionStorage.setItem(MAPPINGS_SESSION_KEY, String(epoch));
      }
    },
    [queryClient],
  );

  const refreshLibraryQueries = useCallback(
    (provider: MappingProvider, epoch?: number) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot(provider) });
      if (typeof epoch === 'number') {
        sessionStorage.setItem(LIBRARY_SESSION_KEYS[provider], String(epoch));
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const handler = (message: unknown) => {
      const envelope = message as {
        _a2a?: boolean;
        topic?: string;
        payload?: Record<string, unknown> & { provider?: MappingProvider; epoch?: number };
      };
      if (!envelope?._a2a) return;

      if (envelope.topic === 'series-updated') {
        const provider = envelope.payload?.provider === 'radarr' ? 'radarr' : 'sonarr';
        refreshLibraryQueries(provider, envelope.payload?.epoch);
      }

      if (envelope.topic === 'settings-changed') {
        refreshSettingsQueries();
        const epoch = envelope.payload?.epoch;
        if (typeof epoch === 'number') {
          sessionStorage.setItem(SETTINGS_SESSION_KEY, String(epoch));
        }
      }

      if (envelope.topic === 'mappings-updated') {
        refreshMappingsQueries(envelope.payload?.epoch);
      }
    };

    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, [refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);

  useEffect(() => {
    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local') return;

      if (changes.libraryEpochSonarr) {
        const next = changes.libraryEpochSonarr.newValue;
        if (typeof next === 'number') {
          refreshLibraryQueries('sonarr', next);
        }
      }

      if (changes.libraryEpochRadarr) {
        const next = changes.libraryEpochRadarr.newValue;
        if (typeof next === 'number') {
          refreshLibraryQueries('radarr', next);
        }
      }

      if (changes.libraryEpoch) {
        const next = changes.libraryEpoch.newValue;
        if (typeof next === 'number') {
          refreshLibraryQueries('sonarr', next);
        }
      }

      if (changes.settingsEpoch) {
        refreshSettingsQueries();
        const next = changes.settingsEpoch.newValue;
        if (typeof next === 'number') {
          sessionStorage.setItem(SETTINGS_SESSION_KEY, String(next));
        }
      }

      if (changes.mappingsEpoch) {
        const next = changes.mappingsEpoch.newValue;
        if (typeof next === 'number') {
          refreshMappingsQueries(next);
        }
      }

      if (changes.publicOptions || changes.sonarrSecrets || changes.radarrSecrets) {
        refreshSettingsQueries();
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
  }, [refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);

  useEffect(() => {
    (async () => {
      try {
        const { libraryEpoch, libraryEpochSonarr, libraryEpochRadarr, settingsEpoch, mappingsEpoch } = await browser.storage.local.get({
          libraryEpoch: 0,
          libraryEpochSonarr: 0,
          libraryEpochRadarr: 0,
          settingsEpoch: 0,
          mappingsEpoch: 0,
        });

        const sonarrEpoch = typeof libraryEpochSonarr === 'number' ? libraryEpochSonarr : libraryEpoch;
        const previousSonarr = Number(sessionStorage.getItem(LIBRARY_SESSION_KEYS.sonarr) ?? '0');
        if (typeof sonarrEpoch === 'number' && sonarrEpoch > previousSonarr) {
          refreshLibraryQueries('sonarr', sonarrEpoch);
        }

        const previousRadarr = Number(sessionStorage.getItem(LIBRARY_SESSION_KEYS.radarr) ?? '0');
        if (typeof libraryEpochRadarr === 'number' && libraryEpochRadarr > previousRadarr) {
          refreshLibraryQueries('radarr', libraryEpochRadarr);
        }

        const previousSettings = Number(sessionStorage.getItem(SETTINGS_SESSION_KEY) ?? '0');
        if (typeof settingsEpoch === 'number' && settingsEpoch > previousSettings) {
          sessionStorage.setItem(SETTINGS_SESSION_KEY, String(settingsEpoch));
          refreshSettingsQueries();
        }

        const previousMappings = Number(sessionStorage.getItem(MAPPINGS_SESSION_KEY) ?? '0');
        if (typeof mappingsEpoch === 'number' && mappingsEpoch > previousMappings) {
          refreshMappingsQueries(mappingsEpoch);
        }
      } catch (error) {
        log.warn('Failed to reconcile ani2arr library epoch.', error instanceof Error ? error.message : String(error));
      }
    })();
  }, [refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);
}
