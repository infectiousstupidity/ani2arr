/** React Query hooks for Sonarr form resources, media status, and mutations over RPC. */
// src/queries/sonarr.ts

import {
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { SourceIdentity } from "@/mapping/source-identity";
import { getAni2arrApi } from "@/rpc";
import type {
	AddSonarrInput,
	GetSeriesStatusOutput,
	SonarrLookupOutput,
	SourceRpcInput,
	StatusInput,
	UpdateSonarrInput,
} from "@/rpc/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import type { ExtensionError } from "@/shared/errors/error.types";
import { invalidateAfterProviderMediaChange } from "@/queries/invalidation";
import {
	normalizeProviderLookupRequest,
	normalizeSonarrStatusRequest,
	queryKeys,
} from "@/queries/query-keys";
import type { ProviderCredentials } from "@/providers/types";
import type { SonarrSeries } from "@/providers/sonarr/types";
import { sourceFromInput } from "@/rpc/source-input";

const hasQueryKeyPrefix = (
	queryKey: QueryKey,
	prefix: readonly unknown[],
): boolean => prefix.every((part, index) => queryKey[index] === part);

const keepPreviousSeriesStatusForSameMedia =
	(source: SourceIdentity) =>
	(
		previousData: GetSeriesStatusOutput | undefined,
		previousQuery: { queryKey: QueryKey } | undefined,
	): GetSeriesStatusOutput | undefined => {
		if (!previousQuery) return undefined;

		return hasQueryKeyPrefix(
			previousQuery.queryKey,
			queryKeys.providerMediaStatusItem("sonarr", source),
		)
			? previousData
			: undefined;
	};

function mutationSourceInput(variables: SourceRpcInput): SourceRpcInput {
	if (variables.source === undefined) {
		return { anilistId: variables.anilistId };
	}
	if ("anilistId" in variables && variables.anilistId !== undefined) {
		return { source: variables.source, anilistId: variables.anilistId };
	}
	return { source: variables.source };
}

export const useSonarrFormResources = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.providerFormResources(
			"sonarr",
			getProviderConnectionScope(options?.credentials),
		),
		queryFn: () => {
			const api = getAni2arrApi();
			return api.getSonarrFormResources(request);
		},
		enabled: options?.enabled ?? true,
		staleTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

export const useSeriesStatus = (
	payload: SourceRpcInput & Pick<StatusInput, "title" | "metadata">,
	options?: {
		enabled?: boolean;
		force_verify?: boolean;
		force_mapping_retry?: boolean;
	},
) => {
	const forceVerify = options?.force_verify === true;
	const forceMappingRetry = options?.force_mapping_retry === true;
	const forceStatusRefresh = forceVerify || forceMappingRetry;
	const source = sourceFromInput(payload);
	const request = normalizeSonarrStatusRequest(payload);

	return useQuery<GetSeriesStatusOutput, ExtensionError>({
		queryKey: queryKeys.providerMediaStatus("sonarr", request),
		queryFn: () =>
			getAni2arrApi().getSeriesStatus({
				...request,
				...(forceVerify ? { force_verify: true } : {}),
				...(forceMappingRetry ? { force_mapping_retry: true } : {}),
			}),
		enabled: options?.enabled ?? true,
		staleTime: forceStatusRefresh ? 0 : 5 * 60 * 1000,
		...(forceStatusRefresh ? { refetchOnMount: "always" } : {}),
		placeholderData: keepPreviousSeriesStatusForSameMedia(source),
		refetchOnWindowFocus: false,
	});
};

export const useSonarrLookupSearch = (input: {
	term: string;
	enabled: boolean;
}) => {
	const request = normalizeProviderLookupRequest(input);

	return useQuery<SonarrLookupOutput>({
		queryKey: queryKeys.providerLookup("sonarr", request),
		queryFn: () => getAni2arrApi().searchSonarr(request),
		enabled: input.enabled && request.term.length > 0,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

export const useAddSeries = () => {
	const queryClient = useQueryClient();
	return useMutation<SonarrSeries, ExtensionError, AddSonarrInput>({
		mutationFn: (input: AddSonarrInput) => getAni2arrApi().addToSonarr(input),
		onSuccess: (_createdSeries, variables) => {
			invalidateAfterProviderMediaChange(queryClient, {
				provider: "sonarr",
				...mutationSourceInput(variables),
			});
		},
	});
};

export const useUpdateSeries = () => {
	const queryClient = useQueryClient();
	return useMutation<SonarrSeries, ExtensionError, UpdateSonarrInput>({
		mutationFn: (input: UpdateSonarrInput) =>
			getAni2arrApi().updateSonarrSeries(input),
		onSuccess: (_updatedSeries, variables) => {
			invalidateAfterProviderMediaChange(queryClient, {
				provider: "sonarr",
				...mutationSourceInput(variables),
			});
		},
	});
};
