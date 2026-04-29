/** Sonarr query hooks owned by the provider domain. */
// src/providers/hooks/sonarr.queries.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import type {
	CheckSeriesStatusResponse,
	SonarrLibraryStatus,
	SonarrLookupOutput,
} from "@/rpc/types";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { getProviderQueryScope, queryKeys } from "@/shared/queries/query-keys";
import {
	normalizeSonarrFormState,
	stripSonarrFormStateForDefaults,
	type SonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type { PublicOptions } from "@/options";
import type { ProviderCredentials, SonarrSeries } from "@/providers";
import type {
	AddSonarrInput,
	SeriesLibraryStatusInput,
	StatusInput,
	UpdateSonarrInput,
} from "@/rpc/schemas";

export const useSonarrMetadata = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.sonarrMetadata(
			getProviderQueryScope(options?.credentials),
		),
		queryFn: async () => {
			try {
				const api = getAni2arrApi();
				return await api.getSonarrMetadata(request);
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

export const useSeriesStatus = (
	payload: Pick<StatusInput, "anilistId" | "title" | "metadata">,
	options?: {
		enabled?: boolean;
		force_verify?: boolean;
		network?: "never";
		ignoreFailureCache?: boolean | (() => boolean);
		priority?: "high" | "normal" | (() => "high" | "normal" | undefined);
	},
) => {
	const forceVerify = options?.force_verify === true;
	return useQuery<CheckSeriesStatusResponse, ExtensionError>({
		queryKey: queryKeys.seriesStatus(payload, "sonarr"),
		queryFn: async () => {
			const request: StatusInput = { anilistId: payload.anilistId };
			if (payload.title !== undefined) {
				request.title = payload.title;
			}
			if (payload.metadata !== undefined) {
				request.metadata = payload.metadata;
			}
			if (options?.force_verify) {
				request.force_verify = true;
			}
			if (options?.network) {
				request.network = options.network;
			}
			const bypassFailureCache =
				typeof options?.ignoreFailureCache === "function"
					? options.ignoreFailureCache()
					: options?.ignoreFailureCache === true;
			if (bypassFailureCache) {
				request.ignoreFailureCache = true;
			}
			const prio =
				typeof options?.priority === "function"
					? options.priority()
					: options?.priority;
			if (prio) {
				request.priority = prio;
			}
			return getAni2arrApi().getSeriesStatus(request);
		},
		enabled: !!payload.anilistId && (options?.enabled ?? true),
		staleTime: forceVerify ? 0 : 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};

export const useSeriesLibraryStatus = (
	payload: Pick<SeriesLibraryStatusInput, "anilistId" | "providerId"> | null,
	options?: {
		enabled?: boolean;
		forceVerify?: boolean;
	},
) => {
	const forceVerify = options?.forceVerify === true;
	return useQuery<SonarrLibraryStatus, ExtensionError>({
		queryKey: payload
			? queryKeys.providerLibraryStatus(
					"sonarr",
					payload.anilistId,
					payload.providerId,
				)
			: [...queryKeys.seriesStatusRoot("sonarr"), "providerLibraryStatus", null],
		queryFn: async () => {
			if (!payload) {
				throw new Error("Series library status payload is required");
			}
			const request: SeriesLibraryStatusInput = {
				anilistId: payload.anilistId,
				providerId: payload.providerId,
			};
			if (forceVerify) {
				request.forceVerify = true;
			}
			return getAni2arrApi().getSeriesLibraryStatus(request);
		},
		enabled:
			!!payload?.anilistId &&
			!!payload.providerId &&
			(options?.enabled ?? true),
		staleTime: forceVerify ? 0 : 5 * 60 * 1000,
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
		enabled: input.enabled && term.length >= 2,
		staleTime: 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1,
	});
};

export const useAddSeries = () => {
	const queryClient = useQueryClient();
	return useMutation<SonarrSeries, ExtensionError, AddSonarrInput>({
		mutationFn: async (input: AddSonarrInput) => {
			try {
				return await getAni2arrApi().addToSonarr(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_createdSeries, variables) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(variables.anilistId, "sonarr"),
			});
		},
	});
};

export const useUpdateSeries = () => {
	const queryClient = useQueryClient();
	return useMutation<SonarrSeries, ExtensionError, UpdateSonarrInput>({
		mutationFn: async (input: UpdateSonarrInput) => {
			try {
				return await getAni2arrApi().updateSonarrSeries(input);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_updatedSeries, variables) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.seriesStatusBase(variables.anilistId, "sonarr"),
			});
		},
	});
};

export const useUpdateSonarrDefaultSettings = () => {
	const queryClient = useQueryClient();
	return useMutation<void, ExtensionError, SonarrFormState>({
		mutationFn: async (defaults: SonarrFormState) => {
			try {
				await getAni2arrApi().updateSonarrDefaults(
					normalizeSonarrFormState(stripSonarrFormStateForDefaults(defaults)),
				);
			} catch (error) {
				throw normalizeError(error);
			}
		},
		onSuccess: (_data, defaults) => {
			const normalizedDefaults = normalizeSonarrFormState(
				stripSonarrFormStateForDefaults(defaults),
			);
			queryClient.setQueryData(
				queryKeys.publicOptions(),
				(prev?: PublicOptions) =>
					prev
						? {
								...prev,
								providers: {
									...prev.providers,
									sonarr: {
										...prev.providers.sonarr,
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
