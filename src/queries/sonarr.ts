/** React Query hooks for Sonarr form resources, library status, and mutations over RPC. */
// src/queries/sonarr.ts

import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import type { AniListId } from "@/anilist";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type {
	CheckSeriesStatusResponse,
	SonarrLookupOutput,
} from "@/rpc/types";
import { getProviderConnectionScope } from "@/providers/settings/provider-connection.validation";
import { normalizeError, type ExtensionError } from "@/shared/errors";
import { queryKeys } from "@/queries/query-keys";
import type { ProviderCredentials, TvdbId } from "@/providers";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { SonarrSeriesLibraryStatus } from "@/providers/sonarr/library";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type {
	AddSonarrInput,
	StatusInput,
	UpdateSonarrInput,
} from "@/rpc/schemas";

interface BuildSonarrQuickAddInputOptions {
	anilistId: AniListId;
	tvdbId: TvdbId | null;
	title: string;
	metadata: AniListMediaHint | null;
	form: SonarrFormState | null;
}

export function buildSonarrQuickAddInput(
	input: BuildSonarrQuickAddInputOptions,
): AddSonarrInput | null {
	if (input.tvdbId === null || input.form === null) {
		return null;
	}

	return {
		anilistId: input.anilistId,
		tvdbId: input.tvdbId,
		title: input.title,
		primaryTitleHint: input.title,
		metadata: input.metadata,
		form: { ...input.form },
	};
}

export const useSonarrFormResources = (options?: {
	enabled?: boolean;
	credentials?: ProviderCredentials | null;
}) => {
	const request = options?.credentials
		? { credentials: options.credentials }
		: undefined;

	return useQuery({
		queryKey: queryKeys.sonarrFormResources(
			getProviderConnectionScope(options?.credentials),
		),
		queryFn: async () => {
			try {
				const api = getAni2arrApi();
				return await api.getSonarrFormResources(request);
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
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[3] === payload.anilistId
				? previousData
				: undefined,
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

function invalidateSonarrMediaMutationQueries(
	queryClient: QueryClient,
	variables: Pick<AddSonarrInput, "anilistId" | "tvdbId">,
): void {
	queryClient.invalidateQueries({
		queryKey: queryKeys.seriesStatusBase(variables.anilistId, "sonarr"),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.sonarrSeriesLibraryStatus(variables.tvdbId),
	});
	queryClient.invalidateQueries({
		queryKey: queryKeys.mappingInspection("sonarr", variables.anilistId),
	});
}

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
			invalidateSonarrMediaMutationQueries(queryClient, variables);
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
			invalidateSonarrMediaMutationQueries(queryClient, variables);
		},
	});
};
