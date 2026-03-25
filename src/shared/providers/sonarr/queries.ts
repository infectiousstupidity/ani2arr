import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import { normalizeError } from '@/shared/errors/error-utils';
import { queryKeys } from '@/shared/queries/query-keys';
import type { ExtensionError, PublicOptions } from '@/shared/types';
import type { SonarrFormState, SonarrSeries } from './types';
import type { AddInput, UpdateSonarrInput } from '@/rpc/schemas';
import type { ProviderCredentials } from '@/shared/providers/common/types';

type TestConnectionPayload = ProviderCredentials;

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

export const useSonarrConnectionStatus = (options?: {
  enabled?: boolean;
  credentials?: ProviderCredentials | null;
}) => {
  const credentialScope =
    options?.credentials?.url && options.credentials.apiKey
      ? `${options.credentials.url}|${options.credentials.apiKey}`
      : 'configured';

  return useQuery({
    queryKey: queryKeys.sonarrConnection(credentialScope),
    queryFn: async () => {
      if (!options?.credentials) {
        throw new Error('Sonarr credentials are required to verify connection status.');
      }
      const api = getAni2arrApi();
      return api.testConnection(options.credentials);
    },
    enabled: (options?.enabled ?? true) && Boolean(options?.credentials?.url && options?.credentials.apiKey),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 0,
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

export const useTestConnection = () => {
  return useMutation<{ version: string }, ExtensionError, TestConnectionPayload>({
    mutationFn: async (payload: TestConnectionPayload) => {
      try {
        return await getAni2arrApi().testConnection(payload);
      } catch (error) {
        throw normalizeError(error);
      }
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
