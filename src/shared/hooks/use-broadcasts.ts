// src/hooks/use-broadcasts.ts
import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import { REVISION_KEYS, STORAGE_KEYS } from '@/lib/storage/keys';
import type { MappingProvider } from '@/shared/types';
import { queryKeys } from '@/shared/queries';

const PUBLIC_OPTIONS_KEY = queryKeys.publicOptions();

const toBrowserStorageChangeKey = (storageKey: string): string => storageKey.replace(/^local:/, '');

const PUBLIC_OPTIONS_STORAGE_CHANGE_KEY = toBrowserStorageChangeKey(STORAGE_KEYS.publicOptions);
const SONARR_SECRETS_STORAGE_CHANGE_KEY = toBrowserStorageChangeKey(STORAGE_KEYS.sonarrSecrets);
const RADARR_SECRETS_STORAGE_CHANGE_KEY = toBrowserStorageChangeKey(STORAGE_KEYS.radarrSecrets);

export function useA2aBroadcasts(): void {
  const queryClient = useQueryClient();

  const refreshSettingsQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PUBLIC_OPTIONS_KEY });
  }, [queryClient]);

  const refreshMappingsQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
  }, [queryClient]);

  const refreshLibraryQueries = useCallback(
    (provider: MappingProvider) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot(provider) });
    },
    [queryClient],
  );

  useEffect(() => {
    const handler = (message: unknown) => {
      const envelope = message as {
        _a2a?: boolean;
        topic?: string;
        payload?: Record<string, unknown> & { provider?: MappingProvider };
      };

      if (!envelope?._a2a) return;

      if (envelope.topic === 'series-updated') {
        const provider = envelope.payload?.provider === 'radarr' ? 'radarr' : 'sonarr';
        refreshLibraryQueries(provider);
        return;
      }

      if (envelope.topic === 'settings-changed') {
        refreshSettingsQueries();
        return;
      }

      if (envelope.topic === 'mappings-updated') {
        refreshMappingsQueries();
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

      if (changes[REVISION_KEYS.sonarrLibrary]) {
        refreshLibraryQueries('sonarr');
      }

      if (changes[REVISION_KEYS.radarrLibrary]) {
        refreshLibraryQueries('radarr');
      }

      if (changes[REVISION_KEYS.settings]) {
        refreshSettingsQueries();
      }

      if (changes[REVISION_KEYS.mappings]) {
        refreshMappingsQueries();
      }

      if (
        changes[PUBLIC_OPTIONS_STORAGE_CHANGE_KEY] ||
        changes[SONARR_SECRETS_STORAGE_CHANGE_KEY] ||
        changes[RADARR_SECRETS_STORAGE_CHANGE_KEY]
      ) {
        refreshSettingsQueries();
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
  }, [refreshLibraryQueries, refreshMappingsQueries, refreshSettingsQueries]);
}
