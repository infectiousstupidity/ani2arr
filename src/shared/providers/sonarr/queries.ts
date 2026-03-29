import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import { normalizeError, type ExtensionError } from '@/shared/errors';
import { queryKeys } from '@/shared/queries/query-keys';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';
import type { PublicOptions } from '@/shared/types';
import type { ProviderCredentials, SonarrSeries } from '@/shared/types/providers';
import type { AddInput, UpdateSonarrInput } from '@/rpc/schemas';

export const useSonarrMetadata = (options?: { enabled?: boolean; credentials?: ProviderCredentials | null }) => {
  const credentialScope =
    options?.credentials?.url && options.credentials.apiKey
      ? `${options.credentials.url}|${options.credentials.apiKey}`
      : 'configured';

  const request = options?.credentials ? { credentials: options.credentials } : undefined;

  return useQuery({
    queryKey: queryKeys.sonarrMetadata(credentialScope),
    queryFn: async () => {
      const api = getAni2arrApi();
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
        return await getAni2arrApi().addToSonarr(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_createdSeries, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, 'sonarr') });
    },
  });
};

export const useUpdateSeries = () => {
  const queryClient = useQueryClient();
  return useMutation<SonarrSeries, ExtensionError, UpdateSonarrInput>({
    mutationFn: async (input: UpdateSonarrInput) => {
      try {
        return await getAni2arrApi().updateSonarrSeries(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_updatedSeries, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, 'sonarr') });
    },
  });
};

export const useUpdateDefaultSettings = () => {
  const queryClient = useQueryClient();
  return useMutation<void, ExtensionError, SonarrFormState>({
    mutationFn: async (defaults: SonarrFormState) => {
      try {
        await getAni2arrApi().updateSonarrDefaults(defaults);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, defaults) => {
      queryClient.setQueryData(queryKeys.publicOptions(), (prev?: PublicOptions) =>
        prev
          ? {
              ...prev,
              providers: {
                ...prev.providers,
                sonarr: {
                  ...prev.providers.sonarr,
                  defaults,
                },
              },
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
