import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import { normalizeError } from '@/shared/errors/error-utils';
import type {
  CheckMovieStatusPayload,
  CheckMovieStatusResponse,
  ExtensionError,
  PublicOptions,
  RadarrCredentialsPayload,
  RadarrFormState,
  RadarrMovie,
} from '@/shared/types';
import type { AddRadarrInput, StatusInput, UpdateRadarrInput } from '@/rpc/schemas';
import { queryKeys } from './query-keys';

export const useRadarrMetadata = (options?: { enabled?: boolean; credentials?: RadarrCredentialsPayload | null }) => {
  const credentialScope =
    options?.credentials?.url && options.credentials.apiKey
      ? `${options.credentials.url}|${options.credentials.apiKey}`
      : 'configured';

  const request = options?.credentials ? { credentials: options.credentials } : undefined;

  return useQuery({
    queryKey: queryKeys.radarrMetadata(credentialScope),
    queryFn: async () => {
      const api = getAni2arrApi();
      return api.getRadarrMetadata(request);
    },
    enabled: options?.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};

export const useMovieStatus = (payload: CheckMovieStatusPayload, options?: {
  enabled?: boolean;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean | (() => boolean);
  priority?: 'high' | 'normal' | (() => 'high' | 'normal' | undefined);
}) =>
  useQuery<CheckMovieStatusResponse, ExtensionError>({
    queryKey: queryKeys.seriesStatus(payload, 'radarr'),
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
      const priority = typeof options?.priority === 'function' ? options.priority() : options?.priority;
      if (priority) {
        request.priority = priority;
      }
      return getAni2arrApi().getMovieStatus(request);
    },
    enabled: !!payload.anilistId && (options?.enabled ?? true),
    staleTime: options?.force_verify ? 0 : 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });

export const useAddMovie = () => {
  const queryClient = useQueryClient();
  return useMutation<RadarrMovie, ExtensionError, AddRadarrInput>({
    mutationFn: async (input: AddRadarrInput) => {
      try {
        return await getAni2arrApi().addToRadarr(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_createdMovie, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, 'radarr') });
    },
  });
};

export const useUpdateMovie = () => {
  const queryClient = useQueryClient();
  return useMutation<RadarrMovie, ExtensionError, UpdateRadarrInput>({
    mutationFn: async (input: UpdateRadarrInput) => {
      try {
        return await getAni2arrApi().updateRadarrMovie(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_updatedMovie, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, 'radarr') });
    },
  });
};

export const useTestRadarrConnection = () =>
  useMutation<{ version: string }, ExtensionError, RadarrCredentialsPayload>({
    mutationFn: async (payload: RadarrCredentialsPayload) => {
      try {
        return await getAni2arrApi().testRadarrConnection(payload);
      } catch (error) {
        throw normalizeError(error);
      }
    },
  });

export const useUpdateRadarrDefaultSettings = () => {
  const queryClient = useQueryClient();
  return useMutation<void, ExtensionError, RadarrFormState>({
    mutationFn: async (defaults: RadarrFormState) => {
      try {
        await getAni2arrApi().updateRadarrDefaults(defaults);
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
                radarr: {
                  ...prev.providers.radarr,
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
