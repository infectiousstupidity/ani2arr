/** Radarr query hooks owned by the provider domain. */
// src/providers/hooks/radarr.queries.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AniListId } from "@/anilist";
import { getAni2arrApi } from "@/rpc";
import type {
	CheckMovieStatusResponse,
	RadarrLookupOutput,
} from "@/rpc/types";
import type { RadarrMovieLibraryStatus } from "@/providers/radarr/library";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { getProviderQueryScope, queryKeys } from "@/shared/queries/query-keys";
import {
	normalizeRadarrFormState,
	stripRadarrFormStateForDefaults,
	type RadarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type { PublicOptions } from "@/options";
import type { ProviderCredentials, RadarrMovie } from "@/providers";
import type {
	AddRadarrInput,
	MovieLibraryStatusInput,
	StatusInput,
	UpdateRadarrInput,
} from "@/rpc/schemas";

export const useRadarrFormOptions = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.radarrFormOptions(
			getProviderQueryScope(options?.credentials),
		),
		queryFn: async () => {
			try {
				const api = getAni2arrApi();
				return await api.getRadarrFormOptions(request);
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
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};

export const useMovieLibraryStatus = (
	payload: {
		anilistId: AniListId;
		tmdbId: MovieLibraryStatusInput["tmdbId"];
	} | null,
	options?: {
		enabled?: boolean;
		forceVerify?: boolean;
	},
) => {
	const forceVerify = options?.forceVerify === true;
	return useQuery<RadarrMovieLibraryStatus, ExtensionError>({
		queryKey: payload
			? queryKeys.providerLibraryStatus(
					"radarr",
					payload.anilistId,
					payload.tmdbId,
				)
			: [...queryKeys.seriesStatusRoot("radarr"), "providerLibraryStatus", null],
		queryFn: async () => {
			if (!payload) {
				throw new Error("Movie library status payload is required");
			}
			const request: MovieLibraryStatusInput = {
				tmdbId: payload.tmdbId,
			};
			if (forceVerify) {
				request.forceVerify = true;
			}
			return getAni2arrApi().getMovieLibraryStatus(request);
		},
		enabled:
			!!payload?.anilistId &&
			!!payload.tmdbId &&
			(options?.enabled ?? true),
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(variables.anilistId, "radarr"),
			});
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
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(variables.anilistId, "radarr"),
			});
		},
	});
};

export const useUpdateRadarrDefaultSettings = () => {
	const queryClient = useQueryClient();
	return useMutation<void, ExtensionError, RadarrFormState>({
		mutationFn: async (defaults: RadarrFormState) => {
			try {
				await getAni2arrApi().updateRadarrDefaults(
					normalizeRadarrFormState(stripRadarrFormStateForDefaults(defaults)),
				);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_data, defaults) => {
			const normalizedDefaults = normalizeRadarrFormState(
				stripRadarrFormStateForDefaults(defaults),
			);
			queryClient.setQueryData(
				queryKeys.publicOptions(),
				(prev?: PublicOptions) =>
					prev
						? {
								...prev,
								providers: {
									...prev.providers,
									radarr: {
										...prev.providers.radarr,
										defaults: normalizedDefaults,
									},
								},
							}
						: prev,
			);
			queryClient.invalidateQueries({ queryKey: queryKeys.options() });
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
		},
	});
};
