import { getAni2arrApi } from "@/rpc";
import { normalizeRadarrStatusRequest } from "@/queries/query-keys";
import {
	useArrFormResources,
	useArrLookup,
	useArrMutation,
	useArrStatus,
} from "@/queries/arr";

export const useRadarrFormResources = (
	options?: Parameters<typeof useArrFormResources>[2],
) =>
	useArrFormResources(
		"radarr",
		(request) => getAni2arrApi().getRadarrFormResources(request),
		options,
	);
export const useMovieStatus = (
	payload: Parameters<typeof useArrStatus>[1],
	options?: Parameters<typeof useArrStatus>[2],
) =>
	useArrStatus(
		{
			provider: "radarr",
			normalize: normalizeRadarrStatusRequest,
			fetch: (request) => getAni2arrApi().getMovieStatus(request),
		},
		payload,
		options,
	);
export const useRadarrLookupSearch = (
	input: Parameters<typeof useArrLookup>[2],
) =>
	useArrLookup(
		"radarr",
		(request) => getAni2arrApi().searchRadarr(request),
		input,
	);
export const useAddMovie = () =>
	useArrMutation("radarr", (input: import("@/rpc/types").AddRadarrInput) =>
		getAni2arrApi().addToRadarr(input),
	);
export const useUpdateMovie = () =>
	useArrMutation("radarr", (input: import("@/rpc/types").UpdateRadarrInput) =>
		getAni2arrApi().updateRadarrMovie(input),
	);
