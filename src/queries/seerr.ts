/** React Query hooks for Seerr connection checks, media status, and requests. */
// src/queries/seerr.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import type { SeerrConnection } from "@/providers/seerr/types";
import { getAni2arrApi } from "@/rpc";
import type {
	GetSeerrMediaDetailsInput,
	GetSeerrMediaDetailsOutput,
	GetSeerrPublicSettingsOutput,
	GetSeerrLinkedAniListEntriesInput,
	GetSeerrLinkedAniListEntriesOutput,
	GetSeerrMediaStatusOutput,
	GetSeerrTargetInput,
	RequestInSeerrInput,
	RequestInSeerrOutput,
	SearchSeerrMediaOutput,
	SeerrConnectionCheckOutput,
	SeerrRequestTarget,
	SetManualSeerrTargetInput,
	SourceRpcInput,
} from "@/rpc/types";
import {
	ErrorCode,
	type ExtensionError,
} from "@/shared/errors/error.types";
import { normalizeMetadataIds, queryKeys } from "./query-keys";

const NON_RETRYABLE_SEERR_ERRORS = new Set<ErrorCode>([
	ErrorCode.SEERR_AUTH_REQUIRED,
	ErrorCode.SEERR_ACCOUNT_CHANGED,
	ErrorCode.SEERR_SESSION_UNAVAILABLE,
	ErrorCode.SEERR_CSRF_REQUIRED,
	ErrorCode.SEERR_PERMISSION_DENIED,
	ErrorCode.SEERR_QUOTA_EXCEEDED,
]);

function shouldRetrySeerrQuery(
	failureCount: number,
	error: ExtensionError,
): boolean {
	return failureCount < 1 && !NON_RETRYABLE_SEERR_ERRORS.has(error.code);
}

export const useConfiguredSeerrConnectionCheck = (options: {
	configuredConnection?: SeerrConnection | null;
	enabled?: boolean;
}) =>
	useQuery<SeerrConnectionCheckOutput, ExtensionError>({
		queryKey: queryKeys.seerrConnection(
			options.configuredConnection
				? `${options.configuredConnection.auth.mode}:${getProviderConnectionScope(
						options.configuredConnection,
					)}`
				: "configured",
		),
		queryFn: () => getAni2arrApi().checkConfiguredSeerrConnection(),
		enabled:
			(options.enabled ?? true) && Boolean(options.configuredConnection),
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		refetchOnMount: "always",
		retry: 0,
	});

export const useSeerrMediaStatus = (options: {
	requestInput: RequestInSeerrInput | null;
	enabled?: boolean;
}) =>
	useQuery<GetSeerrMediaStatusOutput, ExtensionError>({
		queryKey: queryKeys.seerrMediaStatus(options.requestInput),
		queryFn: async () => {
			const requestInput = options.requestInput;
			if (requestInput === null) {
				throw new Error("Seerr request input is required to check media status.");
			}

			return getAni2arrApi().getSeerrMediaStatus({
				mediaType: requestInput.mediaType,
				tmdbId: requestInput.tmdbId,
				...(requestInput.mediaType === "tv" && requestInput.seasons !== undefined
					? { seasons: requestInput.seasons }
					: {}),
			});
		},
		enabled: (options.enabled ?? true) && options.requestInput !== null,
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		retry: shouldRetrySeerrQuery,
	});

export const useSeerrTargets = (
	ids: readonly AniListId[],
	options?: { enabled?: boolean },
) => {
	const normalizedIds = normalizeMetadataIds(ids);
	return useQuery<SeerrRequestTarget[], ExtensionError>({
		queryKey: queryKeys.seerrTargets(normalizedIds),
		queryFn: () => getAni2arrApi().getSeerrTargets(normalizedIds),
		enabled: (options?.enabled ?? true) && normalizedIds.length > 0,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

export const useSeerrTarget = (
	input: GetSeerrTargetInput | AniListId,
	options?: { enabled?: boolean },
) => {
	const sourceInput =
		typeof input === "number" ? ({ anilistId: input } as const) : input;
	return useQuery<SeerrRequestTarget | null, ExtensionError>({
		queryKey: queryKeys.seerrTarget(sourceInput),
		queryFn: () => getAni2arrApi().getSeerrTarget(sourceInput),
		enabled: options?.enabled ?? true,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

export const useSeerrMediaDetails = (options: {
	input: GetSeerrMediaDetailsInput | null;
	enabled?: boolean;
}) =>
	useQuery<GetSeerrMediaDetailsOutput, ExtensionError>({
		queryKey: queryKeys.seerrMediaDetails(options.input),
		queryFn: async () => {
			if (options.input === null) {
				throw new Error("Seerr media details input is required.");
			}

			return getAni2arrApi().getSeerrMediaDetails(options.input);
		},
		enabled: (options.enabled ?? true) && options.input !== null,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: shouldRetrySeerrQuery,
	});

export const useSeerrPublicSettings = (options?: { enabled?: boolean }) =>
	useQuery<GetSeerrPublicSettingsOutput, ExtensionError>({
		queryKey: queryKeys.seerrPublicSettings(),
		queryFn: () => getAni2arrApi().getSeerrPublicSettings(),
		enabled: options?.enabled ?? true,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: shouldRetrySeerrQuery,
	});

export const useSeerrLinkedAniListEntries = (options: {
	input: GetSeerrLinkedAniListEntriesInput | null;
	enabled?: boolean;
}) =>
	useQuery<GetSeerrLinkedAniListEntriesOutput, ExtensionError>({
		queryKey: queryKeys.seerrLinkedAniListEntries(options.input),
		queryFn: async () => {
			if (options.input === null) {
				throw new Error("Seerr linked AniList input is required.");
			}

			return getAni2arrApi().getSeerrLinkedAniListEntries(options.input);
		},
		enabled: (options.enabled ?? true) && options.input !== null,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: shouldRetrySeerrQuery,
	});

export const useSeerrSearch = (options: {
	query: string;
	enabled?: boolean;
}) => {
	const query = options.query.trim();

	return useQuery<SearchSeerrMediaOutput, ExtensionError>({
		queryKey: queryKeys.seerrSearch(query),
		queryFn: () => getAni2arrApi().searchSeerrMedia({ query }),
		enabled: (options.enabled ?? true) && query.length > 0,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: shouldRetrySeerrQuery,
	});
};

export const useSetManualSeerrTarget = () => {
	const queryClient = useQueryClient();

	return useMutation<{ ok: true }, ExtensionError, SetManualSeerrTargetInput>({
		mutationFn: (input) => getAni2arrApi().setManualSeerrTarget(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.seerrLinkedAniListEntriesRoot(),
			});
		},
	});
};

export const useClearManualSeerrTarget = () => {
	const queryClient = useQueryClient();

	return useMutation<{ ok: true }, ExtensionError, SourceRpcInput>({
		mutationFn: (input) => getAni2arrApi().clearManualSeerrTarget(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.seerrLinkedAniListEntriesRoot(),
			});
		},
	});
};

export const useRequestInSeerr = () => {
	const queryClient = useQueryClient();

	return useMutation<RequestInSeerrOutput, ExtensionError, RequestInSeerrInput>({
		mutationFn: (input) => getAni2arrApi().requestInSeerr(input),
		onSuccess: (_request, variables) => {
			queryClient.setQueryData(queryKeys.seerrMediaStatus(variables), {
				status: "pending",
			} satisfies GetSeerrMediaStatusOutput);
			queryClient.invalidateQueries({
				queryKey: queryKeys.seerrMediaDetails(variables),
			});
		},
	});
};
