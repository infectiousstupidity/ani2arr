/** React Query hooks for Seerr connection checks, media status, and requests. */
// src/queries/seerr.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AniListId } from "@/anilist/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import type { ProviderCredentials } from "@/providers/types";
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
	SeerrRequestTarget,
	SetManualSeerrTargetInput,
} from "@/rpc/types";
import type { ExtensionError } from "@/shared/errors/error.types";
import { normalizeMetadataIds, queryKeys } from "./query-keys";

export const useSeerrConnectionCheck = (options: {
	credentials?: ProviderCredentials | null;
	enabled?: boolean;
}) =>
	useQuery<{ ok: true }, ExtensionError>({
		queryKey: queryKeys.seerrConnection(
			getProviderConnectionScope(options.credentials),
		),
		queryFn: async () => {
			if (!options.credentials) {
				throw new Error("Seerr credentials are required to verify the connection.");
			}

			return getAni2arrApi().testSeerrConnection({
				credentials: options.credentials,
			});
		},
		enabled:
			(options.enabled ?? true) &&
			Boolean(options.credentials?.url && options.credentials.apiKey),
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
		retry: 1,
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
		retry: 1,
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
		retry: 1,
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
		retry: 1,
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
