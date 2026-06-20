/** React Query hooks for Sonarr form resources, media status, and mutations over RPC. */
// src/queries/sonarr.ts

import {
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { SourceIdentity } from "@/mapping/types";
import { getAni2arrApi } from "@/rpc";
import type {
	AddSonarrInput,
	GetSeriesStatusOutput,
	SonarrLookupOutput,
	StatusInput,
	UpdateSonarrInput,
} from "@/rpc/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import type { ExtensionError } from "@/shared/errors/error.types";
import { invalidateAfterProviderMediaChange } from "@/queries/invalidation";
import { queryKeys } from "@/queries/query-keys";
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
	payload: Pick<StatusInput, "anilistId" | "title" | "metadata">,
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
	const statusKeyInput = {
		source,
		...(payload.title === undefined ? {} : { title: payload.title }),
		...(payload.metadata === undefined ? {} : { metadata: payload.metadata }),
	};

	return useQuery<GetSeriesStatusOutput, ExtensionError>({
		queryKey: queryKeys.providerMediaStatus("sonarr", statusKeyInput),
		queryFn: async () => {
			const request: StatusInput = { ...statusKeyInput };
			if (options?.force_verify === true) {
				request.force_verify = true;
			}
			if (options?.force_mapping_retry === true) {
				request.force_mapping_retry = true;
			}
			return getAni2arrApi().getSeriesStatus(request);
		},
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
	const term = input.term.trim();

	return useQuery<SonarrLookupOutput>({
		queryKey: queryKeys.providerLookup("sonarr", term),
		queryFn: async () => getAni2arrApi().searchSonarr({ term }),
		enabled: input.enabled && term.length > 0,
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
				...(variables.source === undefined ? {} : { source: variables.source }),
				anilistId: variables.anilistId,
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
				...(variables.source === undefined ? {} : { source: variables.source }),
				anilistId: variables.anilistId,
			});
		},
	});
};
