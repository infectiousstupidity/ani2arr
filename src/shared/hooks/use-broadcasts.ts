// src/hooks/use-broadcasts.ts
import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import type { MappingProvider } from '@/shared/types';
import { logger } from '@/shared/utils/logger';
import { queryKeys } from '@/shared/queries';
import {
  clearA2aSessionStorage,
  CLIENT_STORAGE_RESET_TOPIC,
  LIBRARY_SESSION_KEYS,
  MAPPINGS_SESSION_KEY,
  SETTINGS_SESSION_KEY,
} from '@/shared/utils/client-storage';

const log = logger.create('Broadcasts');

const PUBLIC_OPTIONS_KEY = queryKeys.publicOptions();

const syncSessionEpoch = (key: string, epoch: unknown): void => {
  if (typeof epoch === 'number' && epoch > 0) {
    sessionStorage.setItem(key, String(epoch));
    return;
  }

  sessionStorage.removeItem(key);
};

export function useA2aBroadcasts(): void {
  const queryClient = useQueryClient();

  const refreshSettingsQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PUBLIC_OPTIONS_KEY });
  }, [queryClient]);

  const refreshMappingsQueries = useCallback(
    (epoch?: number) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
      syncSessionEpoch(MAPPINGS_SESSION_KEY, epoch);
    },
    [queryClient],
  );

  const refreshLibraryQueries = useCallback(
    (provider: MappingProvider, epoch?: number) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot(provider) });
      syncSessionEpoch(LIBRARY_SESSION_KEYS[provider], epoch);
    },
    [queryClient],
  );

  const clearClientStorage = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearA2aSessionStorage();
  }, [queryClient]);

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
        syncSessionEpoch(SETTINGS_SESSION_KEY, envelope.payload?.epoch);
      }

      if (envelope.topic === 'mappings-updated') {
        refreshMappingsQueries(envelope.payload?.epoch);
      }

      if (envelope.topic === CLIENT_STORAGE_RESET_TOPIC) {
        void clearClientStorage();
      }
    };

    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, [clearClientStorage, refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);

  useEffect(() => {
    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local') return;

      if (changes.sonarrLibraryRevision) {
        const next = changes.sonarrLibraryRevision.newValue;
        if (typeof next === 'number') {
          refreshLibraryQueries('sonarr', next);
        }
      }

      if (changes.radarrLibraryRevision) {
        const next = changes.radarrLibraryRevision.newValue;
        if (typeof next === 'number') {
          refreshLibraryQueries('radarr', next);
        }
      }

      if (changes.settingsRevision) {
        refreshSettingsQueries();
        syncSessionEpoch(SETTINGS_SESSION_KEY, changes.settingsRevision.newValue);
      }

      if (changes.mappingsRevision) {
        const next = changes.mappingsRevision.newValue;
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
      const {
        sonarrLibraryRevision,
        radarrLibraryRevision,
        settingsRevision,
        mappingsRevision,
      } = await browser.storage.local.get({
        sonarrLibraryRevision: 0,
        radarrLibraryRevision: 0,
        settingsRevision: 0,
        mappingsRevision: 0,
      });

        const previousSonarr = Number(sessionStorage.getItem(LIBRARY_SESSION_KEYS.sonarr) ?? '0');
        if (typeof sonarrLibraryRevision === 'number' && sonarrLibraryRevision > previousSonarr) {
          refreshLibraryQueries('sonarr', sonarrLibraryRevision);
        } else if (!(typeof sonarrLibraryRevision === 'number' && sonarrLibraryRevision > 0)) {
          sessionStorage.removeItem(LIBRARY_SESSION_KEYS.sonarr);
        }

        const previousRadarr = Number(sessionStorage.getItem(LIBRARY_SESSION_KEYS.radarr) ?? '0');
        if (typeof radarrLibraryRevision === 'number' && radarrLibraryRevision > previousRadarr) {
          refreshLibraryQueries('radarr', radarrLibraryRevision);
        } else if (!(typeof radarrLibraryRevision === 'number' && radarrLibraryRevision > 0)) {
          sessionStorage.removeItem(LIBRARY_SESSION_KEYS.radarr);
        }

        const previousSettings = Number(sessionStorage.getItem(SETTINGS_SESSION_KEY) ?? '0');
        if (typeof settingsRevision === 'number' && settingsRevision > previousSettings) {
          syncSessionEpoch(SETTINGS_SESSION_KEY, settingsRevision);
          refreshSettingsQueries();
        } else if (!(typeof settingsRevision === 'number' && settingsRevision > 0)) {
          sessionStorage.removeItem(SETTINGS_SESSION_KEY);
        }

        const previousMappings = Number(sessionStorage.getItem(MAPPINGS_SESSION_KEY) ?? '0');
        if (typeof mappingsRevision === 'number' && mappingsRevision > previousMappings) {
          refreshMappingsQueries(mappingsRevision);
        } else if (!(typeof mappingsRevision === 'number' && mappingsRevision > 0)) {
          sessionStorage.removeItem(MAPPINGS_SESSION_KEY);
        }
      } catch (error) {
        log.warn('Failed to reconcile ani2arr library epoch.', error instanceof Error ? error.message : String(error));
      }
    })();
  }, [refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);
}
