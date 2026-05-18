/** React Query hooks for Radarr form resources, library status, and mutations over RPC. */
// src/queries/radarr.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import type { AniListId } from "@/anilist";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { CheckMovieStatusResponse, RadarrLookupOutput } from "@/rpc/types";
import type { RadarrMovieLibraryStatus } from "@/providers/radarr/library";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { queryKeys } from "@/queries/query-keys";
import type { ProviderCredentials, RadarrMovie, TmdbId } from "@/providers";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type {
	AddRadarrInput,
	StatusInput,
	UpdateRadarrInput,
} from "@/rpc/schemas";

interface BuildRadarrQuickAddInputOptions {
	anilistId: AniListId;
	tmdbId: TmdbId | null;
	title: string;
	metadata: AniListMediaHint | null;
	form: RadarrFormState | null;
}

export function buildRadarrQuickAddInput(
	input: BuildRadarrQuickAddInputOptions,
): AddRadarrInput | null {
	if (input.tmdbId === null || input.form === null) {
		return null;
	}

	return {
		anilistId: input.anilistId,
		tmdbId: input.tmdbId,
		title: input.title,
		primaryTitleHint: input.title,
		metadata: input.metadata,
		form: { ...input.form },
	};
}

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
		queryFn: async () => {
			try {
				const api = getAni2arrApi();
				return await api.getRadarrFormResources(request);
			} catch (error) {
				throw normalizeError(error);
			}
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
		force_verify?: boolean | (() => boolean);
		network?: "never";
		priority?: "high" | "normal" | (() => "high" | "normal" | undefined);
	},
) => {
	const forceVerify = options?.force_verify === true;
	return useQuery<CheckMovieStatusResponse, ExtensionError>({
		queryKey: queryKeys.seriesStatus(payload, "radarr"),
		queryFn: async () => {
			const request: StatusInput = { anilistId: payload.anilistId };
			if (payload.title !== undefined) {
				request.title = payload.title;
			}
			if (payload.metadata !== undefined) {
				request.metadata = payload.metadata;
			}
			const shouldForceVerify =
				typeof options?.force_verify === "function"
					? options.force_verify()
					: options?.force_verify === true;
			if (shouldForceVerify) {
				request.force_verify = true;
			}
			if (options?.network) {
				request.network = options.network;
			}
			const priority =
				typeof options?.priority === "function"
					? options.priority()
					: options?.priority;
			if (priority) {
				request.priority = priority;
			}
			return getAni2arrApi().getMovieStatus(request);
		},
		enabled: !!payload.anilistId && (options?.enabled ?? true),
		staleTime: forceVerify ? 0 : 5 * 60 * 1000,
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[3] === payload.anilistId
				? previousData
				: undefined,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};

export const useMovieLibraryStatus = (
	tmdbId: TmdbId | null,
	options?: {
		enabled?: boolean;
		forceVerify?: boolean;
	},
) => {
	const forceVerify = options?.forceVerify === true;
	return useQuery<RadarrMovieLibraryStatus, ExtensionError>({
		queryKey: queryKeys.radarrMovieLibraryStatus(tmdbId),
		queryFn: async () => {
			if (!tmdbId) {
				throw new Error("TMDB ID is required");
			}
			return getAni2arrApi().getMovieLibraryStatus({
				tmdbId,
				...(forceVerify ? { forceVerify } : {}),
			});
		},
		enabled: !!tmdbId && (options?.enabled ?? true),
		staleTime: forceVerify ? 0 : 5 * 60 * 1000,
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
		enabled: input.enabled && term.length >= 2,
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
		queryKey: queryKeys.seriesStatusBase(variables.anilistId, "radarr"),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.radarrMovieLibraryStatus(variables.tmdbId),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection("radarr", variables.anilistId),
	});
}

export const useAddMovie = () => {
	const queryClient = useQueryClient();
	return useMutation<RadarrMovie, ExtensionError, AddRadarrInput>({
		mutationFn: async (input: AddRadarrInput) => {
			try {
				return await getAni2arrApi().addToRadarr(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_createdMovie, variables) => {
			invalidateRadarrMediaMutationQueries(queryClient, variables);
		},
	});
};

export const useUpdateMovie = () => {
	const queryClient = useQueryClient();
	return useMutation<RadarrMovie, ExtensionError, UpdateRadarrInput>({
		mutationFn: async (input: UpdateRadarrInput) => {
			try {
				return await getAni2arrApi().updateRadarrMovie(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_updatedMovie, variables) => {
			invalidateRadarrMediaMutationQueries(queryClient, variables);
		},
	});
};
