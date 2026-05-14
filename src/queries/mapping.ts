/** React Query hooks for mapping-related RPC reads and mutations. */
// src/shared/queries/mapping.ts

import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import type { AniListId } from "@/anilist";
import { getAni2arrApi } from "@/rpc";
import type {
	GetMappingIdentitiesOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
} from "@/rpc/types";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import type { Provider } from "@/providers";
import type {
	ClearMappingIgnoreInput,
	ClearMappingRejectedCandidateInput,
	ClearManualMappingInput,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
	GetMappingsInput,
} from "@/rpc/schemas";
import { queryKeys } from "./query-keys";

function invalidateMappingMutationQueries(
	queryClient: QueryClient,
	input: Pick<SetManualMappingInput, "anilistId" | "provider">,
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.seriesStatusBase(input.anilistId, input.provider),
	});
	queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingIdentitiesRoot(),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection(input.provider, input.anilistId),
	});
}

export const useSetManualMapping = () => {
	const queryClient = useQueryClient();
	return useMutation<
		{ ok: true },
		ExtensionError,
		SetManualMappingInput
	>({
		mutationFn: async (input: SetManualMappingInput) => {
			try {
				return await getAni2arrApi().setManualMapping(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSettled: (_data, _error, variables) => {
			if (variables) {
				invalidateMappingMutationQueries(queryClient, variables);
			}
		},
	});
};

export const useClearManualMapping = () => {
	const queryClient = useQueryClient();
	return useMutation<
		{ ok: true },
		ExtensionError,
		ClearManualMappingInput
	>({
		mutationFn: async (input: ClearManualMappingInput) => {
			try {
				return await getAni2arrApi().clearManualMapping(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSettled: (_data, _error, variables) => {
			if (variables) {
				invalidateMappingMutationQueries(queryClient, variables);
			}
		},
	});
};

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
			invalidateMappingMutationQueries(queryClient, variables);
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
			invalidateMappingMutationQueries(queryClient, variables);
		},
	});
};

export const useSetMappingRejectedCandidate = () => {
	const queryClient = useQueryClient();
	return useMutation<
		{ ok: true },
		ExtensionError,
		SetMappingRejectedCandidateInput
	>({
		mutationFn: async (input: SetMappingRejectedCandidateInput) => {
			try {
				return await getAni2arrApi().setMappingRejectedCandidate(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_data, variables) => {
			invalidateMappingMutationQueries(queryClient, variables);
		},
	});
};

export const useClearMappingRejectedCandidate = () => {
	const queryClient = useQueryClient();
	return useMutation<
		{ ok: true },
		ExtensionError,
		ClearMappingRejectedCandidateInput
	>({
		mutationFn: async (input: ClearMappingRejectedCandidateInput) => {
			try {
				return await getAni2arrApi().clearMappingRejectedCandidate(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_data, variables) => {
			invalidateMappingMutationQueries(queryClient, variables);
		},
	});
};

export const useMappings = (input?: GetMappingsInput) =>
	useInfiniteQuery<GetMappingsOutput, ExtensionError>({
		queryKey: queryKeys.mappings(input),
		queryFn: async ({ pageParam }) => {
			const api = getAni2arrApi();
			type MappingCursor = NonNullable<GetMappingsInput>["cursor"];
			const cursor = (pageParam as MappingCursor | undefined) ?? input?.cursor;
			return api.getMappings({
				...input,
				...(cursor ? { cursor } : {}),
			});
		},
		initialPageParam: input?.cursor ?? undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 45 * 60 * 1000,
		gcTime: 2 * 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});

export const useMappingIdentities = (
	ids: readonly AniListId[],
	options?: { enabled?: boolean },
) => {
	const normalizedIds = [...new Set(ids)].toSorted((a, b) => a - b);
	return useQuery<GetMappingIdentitiesOutput, ExtensionError>({
		queryKey: queryKeys.mappingIdentities(normalizedIds),
		queryFn: async () => {
			try {
				return await getAni2arrApi().getMappingIdentities(normalizedIds);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		enabled: (options?.enabled ?? true) && normalizedIds.length > 0,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};

export const useMappingInspection = (
	provider: Provider,
	anilistId: AniListId,
) =>
	useQuery<GetMappingInspectionOutput, ExtensionError>({
		queryKey: queryKeys.mappingInspection(provider, anilistId),
		queryFn: async () => {
			try {
				return await getAni2arrApi().getMappingInspection({
					provider,
					anilistId,
				});
			} catch (error) {
				throw normalizeError(error);
			}
		},
		staleTime: 15 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
