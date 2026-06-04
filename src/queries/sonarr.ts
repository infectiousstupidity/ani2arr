/** React Query hooks for Sonarr form resources, media status, and mutations over RPC. */
// src/queries/sonarr.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
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
import { queryKeys } from "@/queries/query-keys";
import type { ProviderCredentials } from "@/providers/types";
import type { SonarrSeries } from "@/providers/sonarr/types";

export const useSonarrFormResources = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.sonarrFormResources(
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
	return useQuery<GetSeriesStatusOutput, ExtensionError>({
		queryKey: queryKeys.mediaStatus("sonarr", payload.anilistId),
		queryFn: async () => {
			const request: StatusInput = { anilistId: payload.anilistId };
			if (payload.title !== undefined) {
				request.title = payload.title;
			}
			if (payload.metadata !== undefined) {
				request.metadata = payload.metadata;
			}
			if (options?.force_verify === true) {
				request.force_verify = true;
			}
			if (options?.force_mapping_retry === true) {
				request.force_mapping_retry = true;
			}
			return getAni2arrApi().getSeriesStatus(request);
		},
		enabled: !!payload.anilistId && (options?.enabled ?? true),
		staleTime: forceStatusRefresh ? 0 : 5 * 60 * 1000,
		...(forceStatusRefresh ? { refetchOnMount: "always" } : {}),
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[3] === payload.anilistId
				? previousData
				: undefined,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};

export const useSonarrLookupSearch = (input: {
	term: string;
	enabled: boolean;
}) => {
	const term = input.term.trim();

	return useQuery<SonarrLookupOutput>({
		queryKey: queryKeys.mappingSearch("sonarr", term),
		queryFn: async () => getAni2arrApi().searchSonarr({ term }),
		enabled: input.enabled && term.length > 0,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

function invalidateSonarrMediaMutationQueries(
	queryClient: QueryClient,
	variables: Pick<AddSonarrInput, "anilistId" | "tvdbId">,
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.mediaStatusItem("sonarr", variables.anilistId),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection("sonarr", variables.anilistId),
	});
}

export const useAddSeries = () => {
	const queryClient = useQueryClient();
	return useMutation<SonarrSeries, ExtensionError, AddSonarrInput>({
		mutationFn: (input: AddSonarrInput) => getAni2arrApi().addToSonarr(input),
		onSuccess: (_createdSeries, variables) => {
			invalidateSonarrMediaMutationQueries(queryClient, variables);
		},
	});
};

export const useUpdateSeries = () => {
	const queryClient = useQueryClient();
	return useMutation<SonarrSeries, ExtensionError, UpdateSonarrInput>({
		mutationFn: (input: UpdateSonarrInput) =>
			getAni2arrApi().updateSonarrSeries(input),
		onSuccess: (_updatedSeries, variables) => {
			invalidateSonarrMediaMutationQueries(queryClient, variables);
		},
	});
};
