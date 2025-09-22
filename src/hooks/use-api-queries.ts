import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getKitsunarrApi } from '@/services';
import { extensionOptions } from '@/utils/storage';
import type { AddRequestPayload, CheckSeriesStatusPayload, ExtensionOptions, SonarrCredentialsPayload, SonarrSeries, TestConnectionPayload } from '@/types';
import { normalizeError } from '@/utils/error-handling';

export const queryKeys = {
  all: ['kitsunarr'] as const,
  options: () => [...queryKeys.all, 'options'] as const,
  seriesStatus: (anilistId: number) => [...queryKeys.all, 'seriesStatus', anilistId] as const,
  sonarrMetadata: (creds: SonarrCredentialsPayload | null) => [...queryKeys.all, 'sonarrMetadata', creds] as const,
};

export type SeriesStatusOptions = {
  enabled?: boolean;
  force_verify?: boolean;
  network?: 'never';
};

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: SeriesStatusOptions) => {
  return useQuery({
    queryKey: queryKeys.seriesStatus(payload.anilistId),
    queryFn: async () => {
      const serviceOptions: { force_verify?: boolean; network?: 'never' } = {};
      if (options?.force_verify) {
        serviceOptions.force_verify = true;
      }
      if (options?.network) {
        serviceOptions.network = options.network;
      }
      return getKitsunarrApi().library.getSeriesStatus(payload.anilistId, serviceOptions);
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
  return useMutation<SonarrSeries, Error, AddRequestPayload>({
    mutationFn: async (payload: AddRequestPayload) => {
      const api = getKitsunarrApi();
      const baseOptions = await extensionOptions.getValue();
      if (!baseOptions) throw new Error('Extension options are not loaded.');

      // This call correctly triggers the full, network-enabled lookup when the user
      // explicitly clicks the "Add" button.
      const { tvdbId } = await api.mapping.resolveTvdbId(payload.anilistId);
      if (!tvdbId) throw new Error('Could not resolve TVDB ID for this series.');

      const sonarrPayload: AddRequestPayload = { ...payload, tvdbId };

      return await api.sonarr.addSeries(sonarrPayload, baseOptions);
    },
    onSuccess: async (addedSeries, variables) => {
      const api = getKitsunarrApi();
      await api.library.addSeriesToCache(addedSeries);
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatus(variables.anilistId) });
    },
    onError: (error: unknown) => {
      throw normalizeError(error);
    },
  });
};

export const useTestConnection = () => {
  return useMutation<{ version: string }, Error, TestConnectionPayload>({
    mutationFn: (payload: TestConnectionPayload) => getKitsunarrApi().sonarr.testConnection(payload),
    onError: (error: unknown) => {
      throw normalizeError(error);
    },
  });
};

export const useSaveOptions = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ExtensionOptions, { previousOptions: ExtensionOptions | undefined }>({
    mutationFn: (options: ExtensionOptions) => extensionOptions.setValue(options),

    onMutate: async (newOptions) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.options() });
      const previousOptions = queryClient.getQueryData<ExtensionOptions>(queryKeys.options());
      queryClient.setQueryData(queryKeys.options(), newOptions);
      return { previousOptions };
    },

    onError: (err, newOptions, context) => {
      if (context?.previousOptions) {
        queryClient.setQueryData(queryKeys.options(), context.previousOptions);
      }
      throw normalizeError(err);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    },
  });
};