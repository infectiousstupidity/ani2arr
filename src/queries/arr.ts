import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SourceIdentity } from "@/mapping/source-identity";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import type {
	ProviderCredentials,
	ProviderFormResources,
} from "@/providers/types";
import { invalidateAfterProviderMediaChange } from "@/queries/invalidation";
import {
	normalizeProviderLookupRequest,
	queryKeys,
} from "@/queries/query-keys";
import type {
	StatusInput,
	GetSeriesStatusOutput,
	GetMovieStatusOutput,
} from "@/rpc/types";
import type { ExtensionError } from "@/shared/errors/error.types";

type ArrProvider = "sonarr" | "radarr";
type StatusPayload = Pick<StatusInput, "source" | "title" | "metadata">;
type StatusRequest = ReturnType<
	typeof import("@/queries/query-keys").normalizeSonarrStatusRequest
>;

export function useArrFormResources(
	provider: ArrProvider,
	fetch: (
		request: { credentials: ProviderCredentials } | undefined,
	) => Promise<ProviderFormResources>,
	options?: { enabled?: boolean; credentials?: ProviderCredentials | null },
) {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;
	return useQuery({
		queryKey: queryKeys.providerFormResources(
			provider,
			getProviderConnectionScope(options?.credentials),
		),
		queryFn: () => fetch(request),
		enabled: options?.enabled ?? true,
		staleTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
}

export function useArrStatus<
	T extends GetSeriesStatusOutput | GetMovieStatusOutput,
>(
	{
		provider,
		normalize,
		fetch,
	}: {
		provider: ArrProvider;
		normalize: (payload: StatusPayload) => StatusRequest;
		fetch: (input: StatusInput) => Promise<T>;
	},
	payload: StatusPayload,
	options?: {
		enabled?: boolean;
		force_verify?: boolean;
		force_mapping_retry?: boolean;
	},
) {
	const forceVerify = options?.force_verify === true;
	const forceMappingRetry = options?.force_mapping_retry === true;
	const forceStatusRefresh = forceVerify || forceMappingRetry;
	const request = normalize(payload);
	return useQuery<T, ExtensionError>({
		queryKey: queryKeys.providerMediaStatus(provider, request),
		queryFn: () =>
			fetch({
				...request,
				...(forceVerify ? { force_verify: true } : {}),
				...(forceMappingRetry ? { force_mapping_retry: true } : {}),
			}),
		enabled: options?.enabled ?? true,
		staleTime: forceStatusRefresh ? 0 : 5 * 60 * 1000,
		...(forceStatusRefresh ? { refetchOnMount: "always" } : {}),
		placeholderData: (previousData, previousQuery) =>
			previousQuery &&
			queryKeys
				.providerMediaStatusItem(provider, payload.source)
				.every((part, index) => previousQuery.queryKey[index] === part)
				? previousData
				: undefined,
		refetchOnWindowFocus: false,
	});
}

export function useArrLookup<T>(
	provider: ArrProvider,
	fetch: (request: { term: string }) => Promise<T>,
	input: { term: string; enabled: boolean },
) {
	const request = normalizeProviderLookupRequest(input);
	return useQuery<T>({
		queryKey: queryKeys.providerLookup(provider, request),
		queryFn: () => fetch(request),
		enabled: input.enabled && request.term.length > 0,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
}

export function useArrMutation<T, TInput extends { source: SourceIdentity }>(
	provider: ArrProvider,
	mutate: (input: TInput) => Promise<T>,
) {
	const queryClient = useQueryClient();
	return useMutation<T, ExtensionError, TInput>({
		mutationFn: mutate,
		onSuccess: (_result, variables) => {
			invalidateAfterProviderMediaChange(queryClient, {
				provider,
				source: variables.source,
			});
		},
	});
}
