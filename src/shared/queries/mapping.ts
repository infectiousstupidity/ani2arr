/** React Query hooks for mapping-related RPC reads and mutations. */
// src/shared/queries/mapping.ts

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import type { ExportStoredMappingsOutput, GetMappingsOutput } from '@/rpc/types';
import { normalizeError, type ExtensionError } from '@/shared/errors';
import type {
  MappingExternalIdRecord,
} from '@/services/mapping/types';
import type { Provider } from '@/providers';
import type {
  ClearMappingBlockedCandidateInput,
  ClearMappingIgnoreInput,
  ClearMappingRejectedCandidateInput,
  ClearMappingOverrideInput,
  SetMappingBlockedCandidateInput,
  SetMappingIgnoreInput,
  SetMappingRejectedCandidateInput,
  SetMappingOverrideInput,
} from '@/rpc/schemas';
import type { GetMappingsInput } from '@/rpc/schemas';
import { queryKeys } from './query-keys';

export const useSetMappingOverride = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingOverrideInput>({
    mutationFn: async (input: SetMappingOverrideInput) => {
      try {
        return await getAni2arrApi().setMappingOverride(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides(variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides('all') });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearMappingOverride = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingOverrideInput>({
    mutationFn: async (input: ClearMappingOverrideInput) => {
      try {
        return await getAni2arrApi().clearMappingOverride(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides(variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides('all') });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearAllMappingOverrides = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError>({
    mutationFn: async () => {
      try {
        return await getAni2arrApi().clearAllMappingOverrides();
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverridesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot('sonarr') });
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot('radarr') });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useExportStoredMappings = () =>
  useMutation<ExportStoredMappingsOutput, ExtensionError>({
    mutationFn: async () => {
      try {
        return await getAni2arrApi().exportStoredMappings();
      } catch (error) {
        throw normalizeError(error);
      }
    },
  });

export const useMappingOverrides = (provider: Provider | 'all' = 'all') =>
  useQuery<MappingExternalIdRecord[], ExtensionError>({
    queryKey: queryKeys.mappingOverrides(provider),
    queryFn: async () => {
      const api = getAni2arrApi();
      const records = await api.getMappingOverrides();
      if (provider === 'all') return records;
      return records.filter(record => record.provider === provider);
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useSetMappingIgnore = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingIgnoreInput>({
    mutationFn: async (input: SetMappingIgnoreInput) => {
      try {
        return await getAni2arrApi().setMappingIgnore(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides(variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides('all') });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearMappingIgnore = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingIgnoreInput>({
    mutationFn: async (input: ClearMappingIgnoreInput) => {
      try {
        return await getAni2arrApi().clearMappingIgnore(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides(variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides('all') });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useSetMappingRejectedCandidate = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingRejectedCandidateInput>({
    mutationFn: async (input: SetMappingRejectedCandidateInput) => {
      try {
        return await getAni2arrApi().setMappingRejectedCandidate(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverridesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearMappingRejectedCandidate = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingRejectedCandidateInput>({
    mutationFn: async (input: ClearMappingRejectedCandidateInput) => {
      try {
        return await getAni2arrApi().clearMappingRejectedCandidate(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverridesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useSetMappingBlockedCandidate = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingBlockedCandidateInput>({
    mutationFn: async (input: SetMappingBlockedCandidateInput) => {
      try {
        return await getAni2arrApi().setMappingBlockedCandidate(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverridesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useClearMappingBlockedCandidate = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingBlockedCandidateInput>({
    mutationFn: async (input: ClearMappingBlockedCandidateInput) => {
      try {
        return await getAni2arrApi().clearMappingBlockedCandidate(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId, variables.provider) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverridesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
    },
  });
};

export const useMappings = (input?: GetMappingsInput) =>
  useInfiniteQuery<GetMappingsOutput, ExtensionError>({
    queryKey: queryKeys.mappings(input),
    queryFn: async ({ pageParam }) => {
      const api = getAni2arrApi();
      type MappingCursor = NonNullable<GetMappingsInput>['cursor'];
      const cursor = (pageParam as MappingCursor | undefined) ?? input?.cursor;
      return api.getMappings({
        ...input,
        ...(cursor ? { cursor } : {}),
      });
    },
    initialPageParam: input?.cursor ?? undefined,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    staleTime: 45 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
