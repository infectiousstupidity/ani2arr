import { getAni2arrApi } from "@/rpc";
import { normalizeSonarrStatusRequest } from "@/queries/query-keys";
import {
	useArrFormResources,
	useArrLookup,
	useArrMutation,
	useArrStatus,
} from "@/queries/arr";

export const useSonarrFormResources = (
	options?: Parameters<typeof useArrFormResources>[2],
) =>
	useArrFormResources(
		"sonarr",
		(request) => getAni2arrApi().getSonarrFormResources(request),
		options,
	);
export const useSeriesStatus = (
	payload: Parameters<typeof useArrStatus>[1],
	options?: Parameters<typeof useArrStatus>[2],
) =>
	useArrStatus(
		{
			provider: "sonarr",
			normalize: normalizeSonarrStatusRequest,
			fetch: (request) => getAni2arrApi().getSeriesStatus(request),
		},
		payload,
		options,
	);
export const useSonarrLookupSearch = (
	input: Parameters<typeof useArrLookup>[2],
) =>
	useArrLookup(
		"sonarr",
		(request) => getAni2arrApi().searchSonarr(request),
		input,
	);
export const useAddSeries = () =>
	useArrMutation("sonarr", (input: import("@/rpc/types").AddSonarrInput) =>
		getAni2arrApi().addToSonarr(input),
	);
export const useUpdateSeries = () =>
	useArrMutation("sonarr", (input: import("@/rpc/types").UpdateSonarrInput) =>
		getAni2arrApi().updateSonarrSeries(input),
	);
