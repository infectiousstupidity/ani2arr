/** React Query hooks for mapping-related RPC reads and mutations. */
// src/queries/mapping.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import { invalidateAfterMappingChange } from "@/queries/invalidation";
import { getAni2arrApi, type Ani2arrApi } from "@/rpc";
import type {
	ClearMappingIgnoreInput,
	ClearMappingRejectedCandidateInput,
	ClearManualMappingInput,
	GetMappingIdentitiesOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
	SetMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	SetManualMappingInput,
	SourceRpcInput,
} from "@/rpc/types";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "@/mapping/source-identity";
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
	useQuery<GetMappingsOutput, ExtensionError>({
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
		queryFn: () => getSourceAniListIdMap(getAni2arrApi(), sources),
		enabled: (options?.enabled ?? true) && sourceKeys.length > 0,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

type SourceAniListIdApi = Pick<
	Ani2arrApi,
	"getAniListIdForSource" | "refreshUpstreamMappings"
>;

export async function getSourceAniListIdMap(
	api: SourceAniListIdApi,
	sources: readonly SourceIdentity[],
): Promise<Record<string, AniListId | null>> {
	const sourceKeys = normalizeSourceKeys(sources);
	const sourcesByKey = new Map(
		sources.map((source) => [sourceIdentityKey(source), source]),
	);

	const resolveBatch = async (): Promise<Record<string, AniListId | null>> => {
		const entries = await Promise.all(
			sourceKeys.map(async (sourceKey) => {
				const source = sourcesByKey.get(sourceKey);
				return [
					sourceKey,
					source === undefined ? null : await api.getAniListIdForSource(source),
				] as const;
			}),
		);

		return Object.fromEntries(entries) as Record<string, AniListId | null>;
	};

	const firstResult = await resolveBatch();
	const hasMissingSourceCrosswalk = sourceKeys.some((sourceKey) => {
		const source = sourcesByKey.get(sourceKey);
		return (
			source !== undefined &&
			source.source !== "anilist" &&
			firstResult[sourceKey] === null
		);
	});

	if (!hasMissingSourceCrosswalk) {
		return firstResult;
	}

	await api.refreshUpstreamMappings();
	return resolveBatch();
}

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
