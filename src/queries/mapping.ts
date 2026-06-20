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
	GetMappingsInput,
	GetMappingIdentitiesOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
	SourceRpcInput,
} from "@/rpc/types";
import { sourceIdentityKey, type SourceIdentity } from "@/mapping/types";
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

export const useMappings = (input?: GetMappingsInput) =>
	useQuery<GetMappingsOutput, ExtensionError>({
		queryKey: queryKeys.mappings(input),
		queryFn: () => getAni2arrApi().getMappings(input),
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
	const sourcesByKey = new Map(
		sources.map((source) => [sourceIdentityKey(source), source]),
	);
	return useQuery<Record<string, AniListId | null>, ExtensionError>({
		queryKey: queryKeys.sourceAniListIds(sourceKeys),
		queryFn: async () => {
			const entries = await Promise.all(
				sourceKeys.map(async (sourceKey) => {
					const source = sourcesByKey.get(sourceKey);
					return [
						sourceKey,
						source === undefined
							? null
							: await getAni2arrApi().getAniListIdForSource(source),
					] as const;
				}),
			);
			return Object.fromEntries(entries) as Record<string, AniListId | null>;
		},
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
	anilistId: AniListId,
	source: SourceIdentity | undefined,
): SourceRpcInput =>
	source === undefined ? { anilistId } : { source, anilistId };

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
