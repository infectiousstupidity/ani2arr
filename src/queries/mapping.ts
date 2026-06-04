/** React Query hooks for mapping-related RPC reads and mutations. */
// src/queries/mapping.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import { getAni2arrApi } from "@/rpc";
import type {
	ClearMappingIgnoreInput,
	ClearMappingRejectedCandidateInput,
	ClearManualMappingInput,
	GetMappingsInput,
	GetMappingIdentitiesOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
} from "@/rpc/types";
import type { ExtensionError } from "@/shared/errors/error.types";
import type { Provider } from "@/providers/types";
import { queryKeys } from "./query-keys";

function invalidateMappingMutationQueries(
	queryClient: QueryClient,
	input: Pick<SetManualMappingInput, "anilistId" | "provider">,
	): void {
		queryClient.invalidateQueries({
			queryKey: queryKeys.mediaStatusItem(input.provider, input.anilistId),
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
	return useMutation<{ ok: true }, ExtensionError, SetManualMappingInput>({
		mutationFn: (input: SetManualMappingInput) =>
			getAni2arrApi().setManualMapping(input),
		onSettled: (_data, _error, variables) => {
			if (variables) {
				invalidateMappingMutationQueries(queryClient, variables);
			}
		},
	});
};

export const useClearManualMapping = () => {
	const queryClient = useQueryClient();
	return useMutation<{ ok: true }, ExtensionError, ClearManualMappingInput>({
		mutationFn: (input: ClearManualMappingInput) =>
			getAni2arrApi().clearManualMapping(input),
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
		mutationFn: (input: SetMappingIgnoreInput) =>
			getAni2arrApi().setMappingIgnore(input),
		onSuccess: (_data, variables) => {
			invalidateMappingMutationQueries(queryClient, variables);
		},
	});
};

export const useClearMappingIgnore = () => {
	const queryClient = useQueryClient();
	return useMutation<{ ok: true }, ExtensionError, ClearMappingIgnoreInput>({
		mutationFn: (input: ClearMappingIgnoreInput) =>
			getAni2arrApi().clearMappingIgnore(input),
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
		mutationFn: (input: SetMappingRejectedCandidateInput) =>
			getAni2arrApi().setMappingRejectedCandidate(input),
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
		mutationFn: (input: ClearMappingRejectedCandidateInput) =>
			getAni2arrApi().clearMappingRejectedCandidate(input),
		onSuccess: (_data, variables) => {
			invalidateMappingMutationQueries(queryClient, variables);
		},
	});
};

export const useMappings = (input?: GetMappingsInput) =>
	useQuery<GetMappingsOutput, ExtensionError>({
		queryKey: queryKeys.mappings(input),
		queryFn: () => getAni2arrApi().getMappings(input),
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
		queryFn: () => getAni2arrApi().getMappingIdentities(normalizedIds),
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
		queryFn: () =>
			getAni2arrApi().getMappingInspection({
				provider,
				anilistId,
			}),
		staleTime: 15 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
