import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
};

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: SeriesStatusOptions) => {
  return useQuery<CheckSeriesStatusResponse, ExtensionError>({
    queryKey: queryKeys.seriesStatus(payload),
    queryFn: async () => {
      const serviceOptions: { force_verify?: boolean; network?: 'never' } = {};
      if (options?.force_verify) {
        serviceOptions.force_verify = true;
      }
      if (options?.network) {
        serviceOptions.network = options.network;
      }
      return getKitsunarrApi().library.getSeriesStatus(payload, serviceOptions);
    },
    enabled: !!payload.anilistId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useExtensionOptions = () => {
  return useQuery({
    queryKey: queryKeys.options(),
    queryFn: () => extensionOptions.getValue(),
  });
};

export const useSonarrMetadata = (creds: SonarrCredentialsPayload | null, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: queryKeys.sonarrMetadata(creds),
    queryFn: async () => {
      if (!creds?.url || !creds.apiKey) throw new Error('Sonarr credentials are not provided.');
      const api = getKitsunarrApi();
      const [qualityProfiles, rootFolders, tags] = await Promise.all([
        api.sonarr.getQualityProfiles(creds),
        api.sonarr.getRootFolders(creds),
        api.sonarr.getTags(creds),
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

        const { tvdbId } = await api.mapping.resolveTvdbId(payload.anilistId, {
          hints: { primaryTitle: payload.title },
        });
        if (!tvdbId) throw new Error('Could not resolve TVDB ID for this series.');

        const sonarrPayload: AddRequestPayload = { ...payload, tvdbId };

        return await api.sonarr.addSeries(sonarrPayload, baseOptions);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: async (addedSeries, variables) => {
      const api = getKitsunarrApi();
      await api.library.addSeriesToCache(addedSeries);
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
    },
  });
};

export const useTestConnection = () => {
  return useMutation<{ version: string }, ExtensionError, TestConnectionPayload>({
    mutationFn: async (payload: TestConnectionPayload) => {
      try {
        return await getKitsunarrApi().sonarr.testConnection(payload);
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