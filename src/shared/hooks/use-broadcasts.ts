// src/hooks/use-broadcasts.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { browser } from 'wxt/browser';
import { logger } from '@/shared/utils/logger';

const log = logger.create('Broadcasts');


const SERIES_ROOT_KEY = ['a2a', 'seriesStatus'] as const;
const LIBRARY_SESSION_KEY = 'a2a_library_epoch';
const SETTINGS_SESSION_KEY = 'a2a_settings_epoch';

export function useA2aBroadcasts(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (message: unknown) => {
      const envelope = message as {
        _a2a?: boolean;
        topic?: string;
        payload?: Record<string, unknown>;
      };
      if (!envelope?._a2a) return;

      if (envelope.topic === 'series-updated') {
        queryClient.invalidateQueries({ queryKey: SERIES_ROOT_KEY });
        const epoch = envelope.payload?.epoch;
        if (typeof epoch === 'number') {
          sessionStorage.setItem(LIBRARY_SESSION_KEY, String(epoch));
        }
      }

      if (envelope.topic === 'settings-changed') {
        queryClient.clear();
        const epoch = envelope.payload?.epoch;
        if (typeof epoch === 'number') {
          sessionStorage.setItem(SETTINGS_SESSION_KEY, String(epoch));
        }
      }
    };

    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, [queryClient]);

  useEffect(() => {
    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local') return;

      if (changes.libraryEpoch) {
        queryClient.invalidateQueries({ queryKey: SERIES_ROOT_KEY });
        const next = changes.libraryEpoch.newValue;
        if (typeof next === 'number') {
          sessionStorage.setItem(LIBRARY_SESSION_KEY, String(next));
        }
      }

      if (changes.settingsEpoch) {
        queryClient.clear();
        const next = changes.settingsEpoch.newValue;
        if (typeof next === 'number') {
          sessionStorage.setItem(SETTINGS_SESSION_KEY, String(next));
        }
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
  }, [queryClient]);

  useEffect(() => {
    (async () => {
      try {
        const { libraryEpoch, settingsEpoch } = await browser.storage.local.get({
          libraryEpoch: 0,
          settingsEpoch: 0,
        });
        const previousLibrary = Number(sessionStorage.getItem(LIBRARY_SESSION_KEY) ?? '0');
        if (typeof libraryEpoch === 'number' && libraryEpoch > previousLibrary) {
          sessionStorage.setItem(LIBRARY_SESSION_KEY, String(libraryEpoch));
          queryClient.invalidateQueries({ queryKey: SERIES_ROOT_KEY });
        }
        const previousSettings = Number(sessionStorage.getItem(SETTINGS_SESSION_KEY) ?? '0');
        if (typeof settingsEpoch === 'number' && settingsEpoch > previousSettings) {
          sessionStorage.setItem(SETTINGS_SESSION_KEY, String(settingsEpoch));
          queryClient.clear();
        }
      } catch (error) {
        log.warn('Failed to reconcile ani2arr library epoch.', error instanceof Error ? error.message : String(error));
      }
    })();
  }, [queryClient]);
}
