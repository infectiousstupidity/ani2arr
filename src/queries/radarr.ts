/** React Query hooks for Radarr form resources, media status, and mutations over RPC. */
// src/queries/radarr.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import type {
	AddRadarrInput,
	GetMovieStatusOutput,
	RadarrLookupOutput,
	StatusInput,
	UpdateRadarrInput,
} from "@/rpc/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import type { ExtensionError } from "@/shared/errors/error.types";
import { queryKeys } from "@/queries/query-keys";
import type { ProviderCredentials } from "@/providers/types";
import type { RadarrMovie } from "@/providers/radarr/types";

export const useRadarrFormResources = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.radarrFormResources(
			getProviderConnectionScope(options?.credentials),
		),
		queryFn: () => {
			const api = getAni2arrApi();
			return api.getRadarrFormResources(request);
		},
		enabled: options?.enabled ?? true,
		staleTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

export const useMovieStatus = (
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
	return useQuery<GetMovieStatusOutput, ExtensionError>({
		queryKey: queryKeys.mediaStatus("radarr", payload.anilistId),
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
			return getAni2arrApi().getMovieStatus(request);
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

export const useRadarrLookupSearch = (input: {
	term: string;
	enabled: boolean;
}) => {
	const term = input.term.trim();

	return useQuery<RadarrLookupOutput>({
		queryKey: queryKeys.mappingSearch("radarr", term),
		queryFn: async () => getAni2arrApi().searchRadarr({ term }),
		enabled: input.enabled && term.length > 0,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

function invalidateRadarrMediaMutationQueries(
	queryClient: QueryClient,
	variables: Pick<AddRadarrInput, "anilistId" | "tmdbId">,
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.mediaStatusItem("radarr", variables.anilistId),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection("radarr", variables.anilistId),
	});
}

export const useAddMovie = () => {
	const queryClient = useQueryClient();
	return useMutation<RadarrMovie, ExtensionError, AddRadarrInput>({
		mutationFn: (input: AddRadarrInput) => getAni2arrApi().addToRadarr(input),
		onSuccess: (_createdMovie, variables) => {
			invalidateRadarrMediaMutationQueries(queryClient, variables);
		},
	});
};

export const useUpdateMovie = () => {
	const queryClient = useQueryClient();
	return useMutation<RadarrMovie, ExtensionError, UpdateRadarrInput>({
		mutationFn: (input: UpdateRadarrInput) =>
			getAni2arrApi().updateRadarrMovie(input),
		onSuccess: (_updatedMovie, variables) => {
			invalidateRadarrMediaMutationQueries(queryClient, variables);
		},
	});
};
