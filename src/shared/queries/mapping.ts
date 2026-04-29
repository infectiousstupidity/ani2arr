/** React Query hooks for mapping-related RPC reads and mutations. */
// src/shared/queries/mapping.ts

import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query";
import type { AniListId } from "@/anilist";
import { getAni2arrApi } from "@/rpc";
import type {
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
	GetMappingIdentitiesOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
} from "@/rpc/types";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import type { PersistedProviderMappingRecord } from "@/mapping/manual";
import type { Provider, ProviderTargetId } from "@/providers";
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

type ProviderStatusCacheValue =
	| CheckMovieStatusResponse
	| CheckSeriesStatusResponse;

const OPTIMISTIC_MAPPING_STATUS_FLAG = "__ani2arrOptimisticMappingStatus";

type OptimisticProviderStatus<TStatus extends ProviderStatusCacheValue> =
	TStatus & {
		[OPTIMISTIC_MAPPING_STATUS_FLAG]?: true;
	};

function markOptimisticStatus<TStatus extends ProviderStatusCacheValue>(
	status: TStatus,
): OptimisticProviderStatus<TStatus> {
	return {
		...status,
		[OPTIMISTIC_MAPPING_STATUS_FLAG]: true,
	};
}

type QuerySnapshot<T> = Array<[QueryKey, T | undefined]>;

type MappingOptimisticContext = {
	statusSnapshots: QuerySnapshot<ProviderStatusCacheValue>;
	inspectionSnapshot: GetMappingInspectionOutput | undefined;
};

type SetManualMappingMutationInput = SetManualMappingInput & {
	optimisticMapping?: MappingSearchResult;
};

type ProviderIdentityLike = {
	tvdbId?: ProviderTargetId;
	tmdbId?: ProviderTargetId;
};

function getMutationProviderId(
	input: SetManualMappingMutationInput,
): ProviderTargetId | null {
	if (input.optimisticMapping) {
		return input.optimisticMapping.providerId;
	}

	const identity = input as ProviderIdentityLike;
	return input.provider === "sonarr"
		? (identity.tvdbId ?? null)
		: (identity.tmdbId ?? null);
}

function toSetManualMappingRequest(
	input: SetManualMappingMutationInput,
): SetManualMappingInput {
	const request = { ...input };
	delete (request as { optimisticMapping?: MappingSearchResult })
		.optimisticMapping;
	return request;
}

function snapshotStatusQueries(
	queryClient: QueryClient,
	input: Pick<SetManualMappingInput, "anilistId" | "provider">,
): QuerySnapshot<ProviderStatusCacheValue> {
	return queryClient.getQueriesData<ProviderStatusCacheValue>({
		queryKey: queryKeys.seriesStatusBase(input.anilistId, input.provider),
	});
}

function restoreQueries<T>(
	queryClient: QueryClient,
	snapshots: QuerySnapshot<T>,
): void {
	for (const [queryKey, data] of snapshots) {
		queryClient.setQueryData(queryKey, data);
	}
}

function clearProviderMedia<TStatus extends ProviderStatusCacheValue>(
	status: TStatus,
	provider: Provider,
): TStatus {
	const nextStatus = { ...status };
	if (provider === "sonarr") {
		delete (nextStatus as Partial<CheckSeriesStatusResponse>).series;
		return nextStatus;
	}

	delete (nextStatus as Partial<CheckMovieStatusResponse>).movie;
	return nextStatus;
}

function applyManualMappingToStatus(
	status: ProviderStatusCacheValue | undefined,
	input: SetManualMappingMutationInput,
	providerId: ProviderTargetId,
): ProviderStatusCacheValue | undefined {
	if (!status) {
		return status;
	}

	const nextStatus = markOptimisticStatus<ProviderStatusCacheValue>({
		...status,
		providerId,
		providerMappingState: "mapped",
		isInLibrary: input.optimisticMapping?.isInLibrary ?? status.isInLibrary,
		manualMappingActive: true,
		mappingSource: "manual",
		mappingReason: "manual-override",
		resolverOutcome: "mapped",
	});
	delete nextStatus.mappingUnknownReason;

	return status.providerId === providerId
		? nextStatus
		: clearProviderMedia(nextStatus, input.provider);
}

function applyClearedManualMappingToStatus(
	status: ProviderStatusCacheValue | undefined,
	provider: Provider,
): ProviderStatusCacheValue | undefined {
	if (!status) {
		return status;
	}

	const nextStatus = markOptimisticStatus<ProviderStatusCacheValue>({
		...status,
		providerId: null,
		providerMappingState: "unmapped",
		isInLibrary: null,
		manualMappingActive: false,
		linkedAniListIds: [],
	});
	delete nextStatus.mappingSource;
	delete nextStatus.mappingReason;
	delete nextStatus.resolverOutcome;
	delete nextStatus.mappingUnknownReason;
	delete nextStatus.libraryUnknownReason;

	return clearProviderMedia(nextStatus, provider);
}

function getLinkedAniListIds(
	mapping: MappingSearchResult | undefined,
): readonly AniListId[] {
	return mapping?.linkedAniListIds ?? [];
}

function applyManualMappingToInspection(
	inspection: GetMappingInspectionOutput | undefined,
	input: SetManualMappingMutationInput,
	providerId: ProviderTargetId,
): GetMappingInspectionOutput | undefined {
	if (!inspection) {
		return inspection;
	}

	const optimisticMapping = input.optimisticMapping;
	const isInLibrary = optimisticMapping?.isInLibrary ?? null;
	const linkedAniListIds = getLinkedAniListIds(optimisticMapping);
	const libraryTitle =
		optimisticMapping?.title ?? inspection.effectiveMapping.library?.title;
	const effectiveMapping = {
		...inspection.effectiveMapping,
		provider: input.provider,
		anilistId: input.anilistId,
		providerId,
		providerMappingState: "mapped" as const,
		isInLibrary,
		mappingRowStatus: isInLibrary
			? ("in-library" as const)
			: ("can-add" as const),
		mappingEntryKind: "manual" as const,
		mappingSource: "manual" as const,
		mappingReason: "manual-override" as const,
		resolverOutcome: "mapped" as const,
		evidence: {
			source: "manual" as const,
			reason: "manual-override" as const,
		},
		library: {
			...inspection.effectiveMapping.library,
			isInLibrary,
			...(libraryTitle === undefined ? {} : { title: libraryTitle }),
			type:
				input.provider === "sonarr" ? ("series" as const) : ("movie" as const),
		},
	};
	delete effectiveMapping.suppressedProviderId;
	delete effectiveMapping.suppressionKind;
	delete effectiveMapping.mappingUnknownReason;
	delete effectiveMapping.libraryUnknownReason;

	return {
		...inspection,
		effectiveMapping,
		providerContext: {
			...inspection.providerContext,
			provider: input.provider,
			providerId,
			linkedAniListIds,
			linkedAniListCount: linkedAniListIds.length,
		},
		whyThisMapping: [
			{
				kind: "effective-source",
				summary: "Manual mapping selected in the media modal.",
				source: "manual",
				reason: "manual-override",
			},
		],
		review: {
			...inspection.review,
			needsReview: false,
		},
	};
}

function applyClearedManualMappingToInspection(
	inspection: GetMappingInspectionOutput | undefined,
	input: ClearManualMappingInput,
): GetMappingInspectionOutput | undefined {
	if (!inspection) {
		return inspection;
	}

	const effectiveMapping = {
		...inspection.effectiveMapping,
		provider: input.provider,
		anilistId: input.anilistId,
		providerId: null,
		providerMappingState: "unmapped" as const,
		isInLibrary: null,
		mappingRowStatus: "unmapped" as const,
		mappingEntryKind: "unmapped" as const,
	};
	delete effectiveMapping.suppressedProviderId;
	delete effectiveMapping.mappingSource;
	delete effectiveMapping.mappingReason;
	delete effectiveMapping.resolverOutcome;
	delete effectiveMapping.suppressionKind;
	delete effectiveMapping.mappingUnknownReason;
	delete effectiveMapping.libraryUnknownReason;
	delete effectiveMapping.evidence;
	delete effectiveMapping.library;

	return {
		...inspection,
		effectiveMapping,
		providerContext: {
			...inspection.providerContext,
			provider: input.provider,
			providerId: null,
			linkedAniListIds: [],
			linkedAniListCount: 0,
		},
		linkedAniListEntries: [],
		whyThisMapping: [],
	};
}

function getOptimisticContext(
	queryClient: QueryClient,
	input: Pick<SetManualMappingInput, "anilistId" | "provider">,
): MappingOptimisticContext {
	return {
		statusSnapshots: snapshotStatusQueries(queryClient, input),
		inspectionSnapshot: queryClient.getQueryData<GetMappingInspectionOutput>(
			queryKeys.mappingInspection(input.provider, input.anilistId),
		),
	};
}

function restoreOptimisticContext(
	queryClient: QueryClient,
	context: MappingOptimisticContext | undefined,
): void {
	if (!context) {
		return;
	}

	restoreQueries(queryClient, context.statusSnapshots);
}

function invalidateMappingMutationQueries(
	queryClient: QueryClient,
	input: Pick<SetManualMappingInput, "anilistId" | "provider">,
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.seriesStatusBase(input.anilistId, input.provider),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.manualMappings(input.provider),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.manualMappings("all"),
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
		SetManualMappingMutationInput,
		MappingOptimisticContext
	>({
		mutationFn: async (input: SetManualMappingMutationInput) => {
			try {
				return await getAni2arrApi().setManualMapping(
					toSetManualMappingRequest(input),
				);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onMutate: async (variables) => {
			const providerId = getMutationProviderId(variables);
			const context = getOptimisticContext(queryClient, variables);
			await queryClient.cancelQueries({
				queryKey: queryKeys.seriesStatusBase(
					variables.anilistId,
					variables.provider,
				),
			});
			await queryClient.cancelQueries({
				queryKey: queryKeys.mappingInspection(
					variables.provider,
					variables.anilistId,
				),
			});

			if (providerId === null) {
				return context;
			}

			queryClient.setQueriesData<ProviderStatusCacheValue>(
				{
					queryKey: queryKeys.seriesStatusBase(
						variables.anilistId,
						variables.provider,
					),
				},
				(status) => applyManualMappingToStatus(status, variables, providerId),
			);
			queryClient.setQueryData<GetMappingInspectionOutput>(
				queryKeys.mappingInspection(variables.provider, variables.anilistId),
				(inspection) =>
					applyManualMappingToInspection(inspection, variables, providerId),
			);

			return context;
		},
		onError: (_error, variables, context) => {
			restoreOptimisticContext(queryClient, context);
			if (context) {
				queryClient.setQueryData(
					queryKeys.mappingInspection(variables.provider, variables.anilistId),
					context.inspectionSnapshot,
				);
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
		ClearManualMappingInput,
		MappingOptimisticContext
	>({
		mutationFn: async (input: ClearManualMappingInput) => {
			try {
				return await getAni2arrApi().clearManualMapping(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onMutate: async (variables) => {
			const context = getOptimisticContext(queryClient, variables);
			await queryClient.cancelQueries({
				queryKey: queryKeys.seriesStatusBase(
					variables.anilistId,
					variables.provider,
				),
			});
			await queryClient.cancelQueries({
				queryKey: queryKeys.mappingInspection(
					variables.provider,
					variables.anilistId,
				),
			});

			queryClient.setQueriesData<ProviderStatusCacheValue>(
				{
					queryKey: queryKeys.seriesStatusBase(
						variables.anilistId,
						variables.provider,
					),
				},
				(status) =>
					applyClearedManualMappingToStatus(status, variables.provider),
			);
			queryClient.setQueryData<GetMappingInspectionOutput>(
				queryKeys.mappingInspection(variables.provider, variables.anilistId),
				(inspection) =>
					applyClearedManualMappingToInspection(inspection, variables),
			);

			return context;
		},
		onError: (_error, variables, context) => {
			restoreOptimisticContext(queryClient, context);
			if (context) {
				queryClient.setQueryData(
					queryKeys.mappingInspection(variables.provider, variables.anilistId),
					context.inspectionSnapshot,
				);
			}
		},
		onSettled: (_data, _error, variables) => {
			if (variables) {
				invalidateMappingMutationQueries(queryClient, variables);
			}
		},
	});
};

export const useClearAllManualMappings = () => {
	const queryClient = useQueryClient();
	return useMutation<{ ok: true }, ExtensionError>({
		mutationFn: async () => {
			try {
				return await getAni2arrApi().clearAllManualMappings();
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappingsRoot(),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusRoot("sonarr"),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusRoot("radarr"),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingInspectionRoot(),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingIdentitiesRoot(),
			});
		},
	});
};

export const useManualMappings = (provider: Provider | "all" = "all") =>
	useQuery<PersistedProviderMappingRecord[], ExtensionError>({
		queryKey: queryKeys.manualMappings(provider),
		queryFn: async () => {
			const api = getAni2arrApi();
			const records = await api.getManualMappings();
			if (provider === "all") return records;
			return records.filter((record) => record.provider === provider);
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(
					variables.anilistId,
					variables.provider,
				),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappings(variables.provider),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappings("all"),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingIdentitiesRoot(),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingInspection(
					variables.provider,
					variables.anilistId,
				),
			});
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(
					variables.anilistId,
					variables.provider,
				),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappings(variables.provider),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappings("all"),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingIdentitiesRoot(),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingInspection(
					variables.provider,
					variables.anilistId,
				),
			});
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(
					variables.anilistId,
					variables.provider,
				),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappingsRoot(),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingIdentitiesRoot(),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingInspection(
					variables.provider,
					variables.anilistId,
				),
			});
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(
					variables.anilistId,
					variables.provider,
				),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.manualMappingsRoot(),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.mappingsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingIdentitiesRoot(),
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.mappingInspection(
					variables.provider,
					variables.anilistId,
				),
			});
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
