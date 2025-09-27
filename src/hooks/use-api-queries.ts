// src/hooks/use-api-queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getKitsunarrApi } from '@/services';
import { extensionOptions } from '@/utils/storage';
import type {
  AddRequestPayload,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionError,
  ExtensionOptions,
  SonarrCredentialsPayload,
  SonarrSeries,
  TestConnectionPayload,
} from '@/types';
import { normalizeError } from '@/utils/error-handling';

const rootQueryKey = ['kitsunarr'] as const;

const normalizeTitleKey = (title?: string) => {
  const trimmed = title?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const seriesStatusBaseKey = (anilistId: number) => [...rootQueryKey, 'seriesStatus', anilistId] as const;

export const queryKeys = {
  all: rootQueryKey,
  options: () => [...rootQueryKey, 'options'] as const,
  seriesStatusRoot: () => [...rootQueryKey, 'seriesStatus'] as const,
  seriesStatusBase: seriesStatusBaseKey,
  seriesStatus: (payload: CheckSeriesStatusPayload) => [
    ...seriesStatusBaseKey(payload.anilistId),
    normalizeTitleKey(payload.title),
  ] as const,
  sonarrMetadata: (creds: SonarrCredentialsPayload | null) => [...rootQueryKey, 'sonarrMetadata', creds] as const,
};

export type SeriesStatusOptions = {
  enabled?: boolean;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean | (() => boolean);
};

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: SeriesStatusOptions) => {
  return useQuery<CheckSeriesStatusResponse, ExtensionError>({
    queryKey: queryKeys.seriesStatus(payload),
    queryFn: async () => {
      const api = getKitsunarrApi();
      const serviceInput = {
        anilistId: payload.anilistId,
        title: payload.title,
        force_verify: options?.force_verify ? true : undefined,
        network: options?.network ?? undefined,
        ignoreFailureCache:
          typeof options?.ignoreFailureCache === 'function'
            ? options.ignoreFailureCache()
            : options?.ignoreFailureCache === true
              ? true
              : undefined,
      };
      return api.getSeriesStatus(serviceInput);
    },
    enabled: !!payload.anilistId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useExtensionOptions = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.options(),
    queryFn: () => extensionOptions.getValue(),
    staleTime: Infinity,
  });

  useEffect(() => {
    const unsubscribe = extensionOptions.watch(newValue => {
      queryClient.setQueryData(queryKeys.options(), newValue);
      // optional: notify background to invalidate caches
      getKitsunarrApi().notifySettingsChanged().catch(() => {});
    });
    return () => unsubscribe();
  }, [queryClient]);

  return query;
};

export const useSonarrMetadata = (creds: SonarrCredentialsPayload | null, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: queryKeys.sonarrMetadata(creds),
    queryFn: async () => {
      if (!creds?.url || !creds.apiKey) throw new Error('Sonarr credentials are not provided.');
      const api = getKitsunarrApi();
      // These are expected to be pass-through RPC methods in services/index.ts.
      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        api.getQualityProfiles(creds),
        api.getRootFolders(creds),
        api.getTags(creds),
      ]);
      return { qualityProfiles, rootFolders, tags };
    },
    enabled: !!creds?.url && !!creds.apiKey && (options?.enabled ?? true),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};

export const useAddSeries = () => {
  const queryClient = useQueryClient();
  return useMutation<SonarrSeries, ExtensionError, AddRequestPayload>({
    mutationFn: async (payload: AddRequestPayload) => {
      try {
        const api = getKitsunarrApi();
        const baseOptions = await extensionOptions.getValue();
        if (!baseOptions) throw new Error('Extension options are not loaded.');

        // Resolve mapping via RPC
        const mapping = await api.resolveMapping({
          anilistId: payload.anilistId,
          primaryTitleHint: payload.title,
        });

        // Use RPC mutation that applies defaults server-side
        const sonarrSeries = await api.addToSonarr({
          tvdbId: mapping.tvdbId,
          profileId: Number(payload.qualityProfileId),
          path: payload.rootFolderPath,
        });

        return sonarrSeries as unknown as SonarrSeries; // RPC can also return { ok: true }; adjust if needed
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: async (_addedSeries, variables) => {
      // Background already refreshes its cache and broadcasts; still invalidate local queries
      const api = getKitsunarrApi();
      await api.notifySettingsChanged().catch(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
    },
  });
};

export const useTestConnection = () => {
  return useMutation<{ version: string }, ExtensionError, TestConnectionPayload>({
    mutationFn: async (payload: TestConnectionPayload) => {
      try {
        // Pass-through RPC expected in services/index.ts
        return await getKitsunarrApi().testConnection(payload);
      } catch (error) {
        throw normalizeError(error);
      }
    },
  });
};

export const useSaveOptions = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ExtensionError, ExtensionOptions, { previousOptions: ExtensionOptions | undefined }>({
    mutationFn: async (options: ExtensionOptions) => {
      try {
        await extensionOptions.setValue(options);
        await getKitsunarrApi().notifySettingsChanged();
      } catch (error) {
        throw normalizeError(error);
      }
    },

    onMutate: async (newOptions) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.options() });
      const previousOptions = queryClient.getQueryData<ExtensionOptions>(queryKeys.options());
      queryClient.setQueryData(queryKeys.options(), newOptions);
      return { previousOptions };
    },

    onError: (_err, _newOptions, context) => {
      if (context?.previousOptions) {
        queryClient.setQueryData(queryKeys.options(), context.previousOptions);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    },
  });
};
