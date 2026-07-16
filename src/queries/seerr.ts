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
	GetSeerrLinkedAniListEntriesInput,
	GetSeerrLinkedAniListEntriesOutput,
	GetSeerrMediaStatusOutput,
	RequestInSeerrInput,
	RequestInSeerrOutput,
	SearchSeerrMediaOutput,
	SeerrConnectionCheckOutput,
	SeerrRequestTarget,
	SetManualSeerrTargetInput,
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

export const useSeerrConnectionCheck = (options: {
	connection?: SeerrConnection | null;
	enabled?: boolean;
}) =>
	useQuery<SeerrConnectionCheckOutput, ExtensionError>({
		queryKey: queryKeys.seerrConnection(
			options.connection
				? `${options.connection.auth.mode}:${getProviderConnectionScope(
						options.connection,
					)}`
				: "configured",
		),
		queryFn: async () => {
			if (!options.connection) {
				throw new Error("Seerr connection is required to verify the connection.");
			}

			return getAni2arrApi().checkConfiguredSeerrConnection();
		},
		enabled: (options.enabled ?? true) && Boolean(options.connection),
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
	anilistId: AniListId,
	options?: { enabled?: boolean },
) =>
	useQuery<SeerrRequestTarget | null, ExtensionError>({
		queryKey: queryKeys.seerrTarget(anilistId),
		queryFn: () => getAni2arrApi().getSeerrTarget(anilistId),
		enabled: options?.enabled ?? true,
		staleTime: 10 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

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
		onSuccess: (_result, variables) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.seerrTarget(variables.anilistId),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.seerrTargetsRoot() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.seerrLinkedAniListEntriesRoot(),
			});
		},
	});
};

export const useClearManualSeerrTarget = () => {
	const queryClient = useQueryClient();

	return useMutation<{ ok: true }, ExtensionError, AniListId>({
		mutationFn: (anilistId) => getAni2arrApi().clearManualSeerrTarget(anilistId),
		onSuccess: (_result, anilistId) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.seerrTarget(anilistId),
			});
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
