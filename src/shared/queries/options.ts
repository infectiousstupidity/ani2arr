import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import {
  getExtensionOptionsSnapshot,
  getPublicOptionsSnapshot,
  parseSettings,
  publicOptions,
  radarrSecrets,
  setExtensionOptionsSnapshot,
  sonarrSecrets,
  toPublicOptions,
} from '@/shared/options/storage';
import type { ExtensionError, ExtensionOptions, PublicOptions } from '@/shared/types';
import type { Settings } from '@/shared/schemas/settings';
import { normalizeError } from '@/shared/errors/error-utils';
import { logger } from '@/shared/utils/logger';
import { queryKeys } from './query-keys';

/**
 * Internal hooks to centralize storage -> query cache synchronization.
 * These keep responsibilities split (public vs combined options) while
 * avoiding duplicated effect bodies across callers.
 */
const useSyncExtensionOptionsQuery = (queryClient: ReturnType<typeof useQueryClient>): void => {
  useEffect(() => {
    const refreshOptions = async () => {
      const snapshot = await getExtensionOptionsSnapshot();
      queryClient.setQueryData(queryKeys.options(), snapshot);
    };
    const unsubscribes = [
      publicOptions.watch(() => {
        void refreshOptions();
      }),
      sonarrSecrets.watch(() => {
        void refreshOptions();
      }),
      radarrSecrets.watch(() => {
        void refreshOptions();
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [queryClient]);
};

const useSyncPublicOptionsQuery = (queryClient: ReturnType<typeof useQueryClient>): void => {
  useEffect(() => {
    let active = true;

    const refreshPublicOptions = async () => {
      const snapshot = await getPublicOptionsSnapshot();
      if (!active) return;
      queryClient.setQueryData(queryKeys.publicOptions(), snapshot);
      logger.configure({ enabled: snapshot.debugLogging || import.meta.env.DEV });
    };

    const unsubscribes = [
      publicOptions.watch(() => {
        void refreshPublicOptions();
      }),
      sonarrSecrets.watch(() => {
        void refreshPublicOptions();
      }),
      radarrSecrets.watch(() => {
        void refreshPublicOptions();
      }),
    ];

    void refreshPublicOptions();

    return () => {
      active = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [queryClient]);
};

export const useExtensionOptions = () => {
  const queryClient = useQueryClient();
  const query = useQuery<Settings>({
    queryKey: queryKeys.options(),
    queryFn: () => getExtensionOptionsSnapshot(),
    staleTime: Infinity,
    meta: { persist: false },
  });

  // Keep combined options in sync when either public slice or secrets change.
  useSyncExtensionOptionsQuery(queryClient);

  return query;
};

export const usePublicOptions = () => {
  const queryClient = useQueryClient();
  const query = useQuery<PublicOptions>({
    queryKey: queryKeys.publicOptions(),
    queryFn: () => getPublicOptionsSnapshot(),
    staleTime: Infinity,
    meta: { persist: false },
  });

  // Keep public options in sync for content/UI contexts.
  useSyncPublicOptionsQuery(queryClient);

  return query;
};

export const useSaveOptions = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ExtensionError, ExtensionOptions, { previousOptions: Settings | undefined }>({
    mutationFn: async (options: ExtensionOptions) => {
      try {
        await setExtensionOptionsSnapshot(options);
        await getAni2arrApi().notifySettingsChanged();
      } catch (error) {
        throw normalizeError(error);
      }
    },

    onMutate: async newOptions => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.options() }),
        queryClient.cancelQueries({ queryKey: queryKeys.publicOptions() }),
      ]);
      const previousOptions = queryClient.getQueryData<Settings>(queryKeys.options());
      const nextSettings = parseSettings(newOptions);
      const nextPublicOptions = toPublicOptions(nextSettings);
      queryClient.setQueryData(queryKeys.options(), nextSettings);
      queryClient.setQueryData(queryKeys.publicOptions(), nextPublicOptions);
      return { previousOptions };
    },

    onError: (_err, _newOptions, context) => {
      if (context?.previousOptions) {
        const fallback = parseSettings(context.previousOptions);
        queryClient.setQueryData(queryKeys.options(), fallback);
        queryClient.setQueryData(queryKeys.publicOptions(), toPublicOptions(fallback));
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
      queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    },
  });
};
