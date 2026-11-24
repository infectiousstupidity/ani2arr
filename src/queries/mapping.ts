/** React Query hooks for mapping-related RPC reads and mutations. */
// src/queries/mapping.ts

import {
	keepPreviousData,
	useMutation,
	useQueries,
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
	GetMappingInspectionOutput,
	MappingIdentity,
	MappingListGroup,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
} from "@/rpc/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { ExtensionError } from "@/shared/errors/error.types";
import type { Provider } from "@/providers/types";
import { createBatchLoader } from "@/shared/utils/batch-loader";
import {
	normalizeMappingInspectionRequest,
	normalizeMetadataIds,
	queryKeys,
} from "./query-keys";

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

// One RPC per render pass: per-ID queries started together share a request.
const mappingIdentityLoader = createBatchLoader<AniListId, MappingIdentity[]>({
	keyOf: (id) => id,
	windowMs: 0,
	loadMany: async (ids) => {
		const identities = await getAni2arrApi().getMappingIdentities(ids);
		return ids.map((id) =>
			identities.filter((identity) => identity.anilistId === id),
		);
	},
});

/**
 * Mapping identities cached per AniList ID, so a new browse batch fetches only
 * its new IDs and already-rendered cards keep their data.
 */
export const useMappingIdentities = (
	ids: readonly AniListId[],
	options?: { enabled?: boolean },
): { data: MappingIdentity[]; pendingIds: ReadonlySet<AniListId> } => {
	const normalizedIds = normalizeMetadataIds(ids);
	const enabled = options?.enabled ?? true;
	const results = useQueries({
		queries: normalizedIds.map((id) => ({
			queryKey: queryKeys.mappingIdentity(id),
			queryFn: () => mappingIdentityLoader.load(id),
			enabled,
			staleTime: 10 * 60 * 1000,
			gcTime: 60 * 60 * 1000,
			refetchOnWindowFocus: false,
		})),
	});
	const data: MappingIdentity[] = [];
	const pendingIds = new Set<AniListId>();
	for (const [index, result] of results.entries()) {
		if (result.data) data.push(...result.data);
		else if (enabled && result.isPending) pendingIds.add(normalizedIds[index]!);
	}
	return { data, pendingIds };
};

export const useSourceAniListIdMap = (
	sources: readonly SourceIdentity[],
	options?: { enabled?: boolean },
) => {
	return useQuery<Record<string, AniListId | null>, ExtensionError>({
		queryKey: queryKeys.sourceAniListIds(sources),
		queryFn: () => getAni2arrApi().resolveAniListIdsForSources([...sources]),
		enabled: (options?.enabled ?? true) && sources.length > 0,
		// Keep resolved cards stable while a grown source list loads.
		placeholderData: keepPreviousData,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

export const useMappingInspection = (
	provider: Provider,
	source: SourceIdentity,
) => {
	const request = normalizeMappingInspectionRequest(provider, source);
	return useQuery<GetMappingInspectionOutput, ExtensionError>({
		queryKey: queryKeys.mappingInspection(request),
		queryFn: () => getAni2arrApi().getMappingInspection(request),
		staleTime: 15 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};
