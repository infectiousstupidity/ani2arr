/** React Query hooks for Sonarr form options and series mutations over RPC. */
// src/queries/sonarr.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { getProviderQueryScope, queryKeys } from "@/shared/queries/query-keys";
import type { ProviderCredentials } from "@/providers";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type { AddSonarrInput, UpdateSonarrInput } from "@/rpc/schemas";

export const useSonarrFormOptions = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.sonarrFormOptions(
			getProviderQueryScope(options?.credentials),
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
