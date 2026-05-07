/** React Query hooks for Sonarr form options, library status, and mutations over RPC. */
// src/queries/sonarr.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import type {
	CheckSeriesStatusResponse,
	SonarrLookupOutput,
} from "@/rpc/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { queryKeys } from "@/shared/queries/query-keys";
import type { ProviderCredentials, TvdbId } from "@/providers";
import type { SonarrSeriesLibraryStatus } from "@/providers/sonarr/library";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type { AddSonarrInput, StatusInput, UpdateSonarrInput } from "@/rpc/schemas";

export const useSonarrFormOptions = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.sonarrFormOptions(
			getProviderConnectionScope(options?.credentials),
		),
		queryFn: async () => {
			try {
				const api = getAni2arrApi();
				return await api.getSonarrFormOptions(request);
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
		force_verify?: boolean | (() => boolean);
		network?: "never";
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
			return getAni2arrApi().getSeriesStatus(request);
		},
		enabled: !!payload.anilistId && (options?.enabled ?? true),
		staleTime: forceVerify ? 0 : 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		meta: { persist: false },
	});
};

export const useSeriesLibraryStatus = (
	tvdbId: TvdbId | null,
	options?: {
		enabled?: boolean;
		forceVerify?: boolean;
	},
) => {
	const forceVerify = options?.forceVerify === true;
	return useQuery<SonarrSeriesLibraryStatus, ExtensionError>({
		queryKey: queryKeys.sonarrSeriesLibraryStatus(tvdbId),
		queryFn: async () => {
			if (!tvdbId) {
				throw new Error("TVDB ID is required");
			}
			return getAni2arrApi().getSeriesLibraryStatus({
				tvdbId,
				...(forceVerify ? { forceVerify } : {}),
			});
		},
		enabled: !!tvdbId && (options?.enabled ?? true),
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
