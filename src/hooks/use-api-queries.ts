// src/hooks/use-api-queries.ts
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

// ... (useSeriesStatus, useExtensionOptions, useSonarrMetadata, useAddSeries, useTestConnection remain unchanged) ...

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: { enabled?: boolean; force_verify?: boolean }) => {
  return useQuery({
    queryKey: queryKeys.seriesStatus(payload.anilistId),
    queryFn: async () => {
      const serviceOptions: { force_verify?: boolean } = {};
      if (options?.force_verify) {
        serviceOptions.force_verify = true;
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

      // 1. Resolve TVDB ID.
      const { tvdbId } = await api.mapping.resolveTvdbId(payload.anilistId);
      if (!tvdbId) throw new Error('Could not resolve TVDB ID for this series.');

      // 2. Construct payload for Sonarr
      const sonarrPayload: AddRequestPayload = { ...payload, tvdbId };

      // 3. Call the Sonarr API directly with the payload.
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


// --- CHANGED: Full rewrite of useSaveOptions ---
export const useSaveOptions = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ExtensionOptions, { previousOptions: ExtensionOptions | undefined }>({
    mutationFn: (options: ExtensionOptions) => extensionOptions.setValue(options),

    // Step 1: Called before the mutation function.
    onMutate: async (newOptions) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update.
      await queryClient.cancelQueries({ queryKey: queryKeys.options() });

      // Snapshot the previous value.
      const previousOptions = queryClient.getQueryData<ExtensionOptions>(queryKeys.options());

      // Optimistically update to the new value.
      queryClient.setQueryData(queryKeys.options(), newOptions);

      // Return a context object with the snapshotted value.
      return { previousOptions };
    },

    // Step 2: If the mutation fails, use the context we returned to roll back.
    onError: (err, newOptions, context) => {
      if (context?.previousOptions) {
        queryClient.setQueryData(queryKeys.options(), context.previousOptions);
      }
      throw normalizeError(err);
    },

    // Step 3: Always re-fetch after the mutation is settled (on success or error).
    // This ensures our client state is eventually consistent with the backend.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    },
  });
};