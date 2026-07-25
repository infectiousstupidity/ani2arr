/** React Query hooks for mapping-related RPC reads and mutations. */
// src/queries/mapping.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import { invalidateAfterMappingChange } from "@/queries/invalidation";
import { getAni2arrApi } from "@/rpc";
import type {
	ClearMappingIgnoreInput,
	ClearMappingRejectedCandidateInput,
	ClearManualMappingInput,
	GetMappingIdentitiesOutput,
	GetMappingInspectionOutput,
	MappingListGroup,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
	SourceRpcInput,
} from "@/rpc/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { ExtensionError } from "@/shared/errors/error.types";
import type { Provider } from "@/providers/types";
import { normalizeMetadataIds, normalizeSourceKeys, queryKeys } from "./query-keys";

export const useSetManualMapping = () => {
	const queryClient = useQueryClient();
	return useMutation<{ ok: true }, ExtensionError, SetManualMappingInput>({
		mutationFn: (input: SetManualMappingInput) =>
			getAni2arrApi().setManualMapping(input),
		onSettled: (_data, _error, variables) => {
			if (variables) {
				invalidateAfterMappingChange(queryClient, variables);
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
				invalidateAfterMappingChange(queryClient, variables);
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
			invalidateAfterMappingChange(queryClient, variables);
		},
	});
};

export const useClearMappingIgnore = () => {
	const queryClient = useQueryClient();
	return useMutation<{ ok: true }, ExtensionError, ClearMappingIgnoreInput>({
		mutationFn: (input: ClearMappingIgnoreInput) =>
			getAni2arrApi().clearMappingIgnore(input),
		onSuccess: (_data, variables) => {
			invalidateAfterMappingChange(queryClient, variables);
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
			invalidateAfterMappingChange(queryClient, variables);
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
			invalidateAfterMappingChange(queryClient, variables);
		},
	});
};

export const useMappings = () =>
	useQuery<MappingListGroup[], ExtensionError>({
		queryKey: queryKeys.mappings(),
		queryFn: () => getAni2arrApi().getMappings(),
		staleTime: 45 * 60 * 1000,
		gcTime: 2 * 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

export const useMappingIdentities = (
	ids: readonly AniListId[],
	options?: { enabled?: boolean },
) => {
	const normalizedIds = normalizeMetadataIds(ids);
	return useQuery<GetMappingIdentitiesOutput, ExtensionError>({
		queryKey: queryKeys.mappingIdentities(normalizedIds),
		queryFn: () => getAni2arrApi().getMappingIdentities(normalizedIds),
		enabled: (options?.enabled ?? true) && normalizedIds.length > 0,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

export const useSourceAniListIdMap = (
	sources: readonly SourceIdentity[],
	options?: { enabled?: boolean },
) => {
	const sourceKeys = normalizeSourceKeys(sources);
	return useQuery<Record<string, AniListId | null>, ExtensionError>({
		queryKey: queryKeys.sourceAniListIds(sourceKeys),
		queryFn: () =>
			getAni2arrApi().resolveAniListIdsForSources([...sources]),
		enabled: (options?.enabled ?? true) && sourceKeys.length > 0,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

const inspectionSourceInput = (
	input: AniListId | SourceRpcInput,
): SourceRpcInput =>
	typeof input === "number" ? { anilistId: input } : input;

export const mappingInspectionInput = (
	anilistId: AniListId | undefined,
	source: SourceIdentity | undefined,
): SourceRpcInput => {
	if (source !== undefined) {
		return anilistId === undefined ? { source } : { source, anilistId };
	}
	if (anilistId !== undefined) return { anilistId };
	throw new Error("Missing mapping inspection source.");
};

export const useMappingInspection = (
	provider: Provider,
	input: AniListId | SourceRpcInput,
) => {
	const sourceInput = inspectionSourceInput(input);
	return useQuery<GetMappingInspectionOutput, ExtensionError>({
		queryKey: queryKeys.mappingInspection(provider, sourceInput),
		queryFn: () =>
			getAni2arrApi().getMappingInspection({
				provider,
				...sourceInput,
			}),
		staleTime: 15 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};
