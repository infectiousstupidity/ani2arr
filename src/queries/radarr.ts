/** React Query hooks for Radarr form resources, media status, and mutations over RPC. */
// src/queries/radarr.ts

import {
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { SourceIdentity } from "@/mapping/source-identity";
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
import { invalidateAfterProviderMediaChange } from "@/queries/invalidation";
import {
	normalizeProviderLookupRequest,
	normalizeRadarrStatusRequest,
	queryKeys,
} from "@/queries/query-keys";
import type { ProviderCredentials } from "@/providers/types";
import type { RadarrMovie } from "@/providers/radarr/types";

const hasQueryKeyPrefix = (
	queryKey: QueryKey,
	prefix: readonly unknown[],
): boolean => prefix.every((part, index) => queryKey[index] === part);

const keepPreviousMovieStatusForSameMedia =
	(source: SourceIdentity) =>
	(
		previousData: GetMovieStatusOutput | undefined,
		previousQuery: { queryKey: QueryKey } | undefined,
	): GetMovieStatusOutput | undefined => {
		if (!previousQuery) return undefined;

		return hasQueryKeyPrefix(
			previousQuery.queryKey,
			queryKeys.providerMediaStatusItem("radarr", source),
		)
			? previousData
			: undefined;
	};

export const useRadarrFormResources = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.providerFormResources(
			"radarr",
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
	payload: Pick<StatusInput, "source" | "title" | "metadata">,
	options?: {
		enabled?: boolean;
		force_verify?: boolean;
		force_mapping_retry?: boolean;
	},
) => {
	const forceVerify = options?.force_verify === true;
	const forceMappingRetry = options?.force_mapping_retry === true;
	const forceStatusRefresh = forceVerify || forceMappingRetry;
	const source = payload.source;
	const request = normalizeRadarrStatusRequest(payload);

	return useQuery<GetMovieStatusOutput, ExtensionError>({
		queryKey: queryKeys.providerMediaStatus("radarr", request),
		queryFn: () =>
			getAni2arrApi().getMovieStatus({
				...request,
				...(forceVerify ? { force_verify: true } : {}),
				...(forceMappingRetry ? { force_mapping_retry: true } : {}),
			}),
		enabled: options?.enabled ?? true,
		staleTime: forceStatusRefresh ? 0 : 5 * 60 * 1000,
		...(forceStatusRefresh ? { refetchOnMount: "always" } : {}),
		placeholderData: keepPreviousMovieStatusForSameMedia(source),
		refetchOnWindowFocus: false,
	});
};

export const useRadarrLookupSearch = (input: {
	term: string;
	enabled: boolean;
}) => {
	const request = normalizeProviderLookupRequest(input);

	return useQuery<RadarrLookupOutput>({
		queryKey: queryKeys.providerLookup("radarr", request),
		queryFn: () => getAni2arrApi().searchRadarr(request),
		enabled: input.enabled && request.term.length > 0,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

export const useAddMovie = () => {
	const queryClient = useQueryClient();
	return useMutation<RadarrMovie, ExtensionError, AddRadarrInput>({
		mutationFn: (input: AddRadarrInput) => getAni2arrApi().addToRadarr(input),
		onSuccess: (_createdMovie, variables) => {
				invalidateAfterProviderMediaChange(queryClient, {
					provider: "radarr",
					source: variables.source,
			});
		},
	});
};

export const useUpdateMovie = () => {
	const queryClient = useQueryClient();
	return useMutation<RadarrMovie, ExtensionError, UpdateRadarrInput>({
		mutationFn: (input: UpdateRadarrInput) =>
			getAni2arrApi().updateRadarrMovie(input),
		onSuccess: (_updatedMovie, variables) => {
				invalidateAfterProviderMediaChange(queryClient, {
					provider: "radarr",
					source: variables.source,
			});
		},
	});
};
