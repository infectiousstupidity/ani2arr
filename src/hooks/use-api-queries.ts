// src/hooks/use-api-queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getKitsunarrApi } from '@/rpc';
import {
  getExtensionOptionsSnapshot,
  getPublicOptionsSnapshot,
  publicOptions,
  setExtensionOptionsSnapshot,
  sonarrSecrets,
} from '@/utils/storage';
import type {
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionError,
  ExtensionOptions,
  PublicOptions,
  SonarrFormState,
  MediaMetadataHint,
  SonarrCredentialsPayload,
  SonarrSeries,
  TestConnectionPayload,
} from '@/types';
import type { AddInput, StatusInput } from '@/rpc/schemas';
import { normalizeError } from '@/utils/error-handling';

const rootQueryKey = ['kitsunarr'] as const;

const normalizeTitleKey = (title?: string) => {
  const trimmed = title?.trim();
  return trimmed ? trimmed.toLowerCase() : '::';
};

const normalizeMetadataKey = (metadata?: MediaMetadataHint | null) => {
  if (!metadata) return '::';
  const titles = metadata.titles ?? {};
  const english = typeof titles?.english === 'string' ? titles.english.trim() : '';
  const romaji = typeof titles?.romaji === 'string' ? titles.romaji.trim() : '';
  const native = typeof titles?.native === 'string' ? titles.native.trim() : '';
  const synonyms = Array.isArray(metadata.synonyms) ? metadata.synonyms.slice(0, 5).join('|') : '';
  const startYear = metadata.startYear ?? '';
  const format = metadata.format ?? '';
  const prequels = Array.isArray(metadata.relationPrequelIds)
    ? metadata.relationPrequelIds.join(',')
    : '';
  return [english, romaji, native, synonyms, startYear, format, prequels].join('~');
};

const seriesStatusBaseKey = (anilistId: number) => [...rootQueryKey, 'seriesStatus', anilistId] as const;

export const queryKeys = {
  all: rootQueryKey,
  options: () => [...rootQueryKey, 'options'] as const,
  publicOptions: () => [...rootQueryKey, 'publicOptions'] as const,
  seriesStatusRoot: () => [...rootQueryKey, 'seriesStatus'] as const,
  seriesStatusBase: seriesStatusBaseKey,
  seriesStatus: (payload: CheckSeriesStatusPayload) => [
    ...seriesStatusBaseKey(payload.anilistId),
    normalizeTitleKey(payload.title),
    normalizeMetadataKey(payload.metadata),
  ] as const,
  sonarrMetadata: (scope?: string) => [...rootQueryKey, 'sonarrMetadata', scope ?? 'configured'] as const,
};

/**
 * Internal hooks to centralize storage -> query cache synchronization.
 * These keep responsibilities split (public vs combined options) while
 * avoiding duplicated effect bodies across callers.
 */
const useSyncExtensionOptionsQuery = (queryClient: QueryClient): void => {
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
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [queryClient]);
};

const useSyncPublicOptionsQuery = (queryClient: QueryClient): void => {
  useEffect(() => {
    const unsubscribe = publicOptions.watch(newValue => {
      queryClient.setQueryData(queryKeys.publicOptions(), newValue);
    });
    return () => unsubscribe();
  }, [queryClient]);
};

export type SeriesStatusOptions = {
  enabled?: boolean;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean | (() => boolean);
};

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: SeriesStatusOptions) => {
  const forceVerify = options?.force_verify === true;
  return useQuery<CheckSeriesStatusResponse, ExtensionError>({
    queryKey: queryKeys.seriesStatus(payload),
    queryFn: async () => {
      const request: StatusInput = { anilistId: payload.anilistId };
      if (payload.title !== undefined) {
        request.title = payload.title;
      }
      if (payload.metadata !== undefined) {
        request.metadata = payload.metadata;
      }
      if (options?.force_verify) {
        request.force_verify = true;
      }
      if (options?.network) {
        request.network = options.network;
      }
      const bypassFailureCache =
        typeof options?.ignoreFailureCache === 'function'
          ? options.ignoreFailureCache()
          : options?.ignoreFailureCache === true;
      if (bypassFailureCache) {
        request.ignoreFailureCache = true;
      }
      return getKitsunarrApi().getSeriesStatus(request);
    },
    enabled: !!payload.anilistId && (options?.enabled ?? true),
    staleTime: forceVerify ? 0 : 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useExtensionOptions = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
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

export const useSonarrMetadata = (options?: { enabled?: boolean; credentials?: SonarrCredentialsPayload | null }) => {
  const credentialScope = options?.credentials?.url && options.credentials.apiKey
    ? `${options.credentials.url}|${options.credentials.apiKey}`
    : 'configured';

  const request = options?.credentials ? { credentials: options.credentials } : undefined;

  return useQuery({
    queryKey: queryKeys.sonarrMetadata(credentialScope),
    queryFn: async () => {
      const api = getKitsunarrApi();
      return api.getSonarrMetadata(request);
    },
    enabled: options?.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};

export const useAddSeries = () => {
  const queryClient = useQueryClient();
  return useMutation<SonarrSeries, ExtensionError, AddInput>({
    mutationFn: async (input: AddInput) => {
      try {
        return await getKitsunarrApi().addToSonarr(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_createdSeries, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
    },
  });
};

export const useTestConnection = () => {
  return useMutation<{ version: string }, ExtensionError, TestConnectionPayload>({
    mutationFn: async (payload: TestConnectionPayload) => {
      try {
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
        await setExtensionOptionsSnapshot(options);
        await getKitsunarrApi().notifySettingsChanged();
      } catch (error) {
        throw normalizeError(error);
      }
    },

    onMutate: async (newOptions) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.options() }),
        queryClient.cancelQueries({ queryKey: queryKeys.publicOptions() }),
      ]);
      const previousOptions = queryClient.getQueryData<ExtensionOptions>(queryKeys.options());
      queryClient.setQueryData(queryKeys.options(), newOptions);
      queryClient.setQueryData(queryKeys.publicOptions(), {
        sonarrUrl: newOptions.sonarrUrl,
        defaults: newOptions.defaults,
        isConfigured: Boolean(newOptions.sonarrUrl && newOptions.sonarrApiKey),
      } satisfies PublicOptions);
      return { previousOptions };
    },

    onError: (_err, _newOptions, context) => {
      if (context?.previousOptions) {
        queryClient.setQueryData(queryKeys.options(), context.previousOptions);
        queryClient.setQueryData(queryKeys.publicOptions(), {
          sonarrUrl: context.previousOptions.sonarrUrl,
          defaults: context.previousOptions.defaults,
          isConfigured: Boolean(
            context.previousOptions.sonarrUrl && context.previousOptions.sonarrApiKey,
          ),
        } satisfies PublicOptions);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
      queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    },
  });
};

export const useUpdateDefaultSettings = () => {
  const queryClient = useQueryClient();
  return useMutation<void, ExtensionError, SonarrFormState>({
    mutationFn: async (defaults: SonarrFormState) => {
      try {
        await getKitsunarrApi().updateDefaults(defaults);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, defaults) => {
      queryClient.setQueryData(queryKeys.publicOptions(), (prev?: PublicOptions) =>
        prev
          ? {
              ...prev,
              defaults,
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    },
  });
};
