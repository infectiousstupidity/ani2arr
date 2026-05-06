/** LEGACY: Temporary Sonarr status/search hooks until query ownership is split. */
// src/providers/hooks/sonarr.queries.ts

import { useQuery } from "@tanstack/react-query";
import { getAni2arrApi } from "@/rpc";
import type {
	CheckSeriesStatusResponse,
	SonarrLookupOutput,
} from "@/rpc/types";
import type { ExtensionError } from "@/shared/errors";
import { queryKeys } from "@/shared/queries/query-keys";
import type { StatusInput } from "@/rpc/schemas";

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
