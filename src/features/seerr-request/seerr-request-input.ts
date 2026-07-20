/** Converts one effective Seerr target into a request RPC input. */

import type {
	RequestInSeerrInput,
	SeerrRequestTarget,
} from "@/rpc/types";

export function toSeerrRequestInput(
	target: SeerrRequestTarget | null,
	selectedSeasons?: readonly number[],
): RequestInSeerrInput | null {
	if (target === null) return null;

	if (target.mediaType === "movie") {
		return {
			anilistId: target.anilistId,
			mediaType: "movie",
			tmdbId: target.tmdbId,
		};
	}

	const seasons = selectedSeasons ?? target.seasons;
	if (seasons.length === 0) return null;

	return {
		anilistId: target.anilistId,
		mediaType: "tv",
		tmdbId: target.tmdbId,
		...(target.tvdbId === undefined ? {} : { tvdbId: target.tvdbId }),
		seasons: [...seasons],
	};
}
