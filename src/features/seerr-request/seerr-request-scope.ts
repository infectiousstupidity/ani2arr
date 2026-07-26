/** Derives the modal-local scope for a Seerr TV request. */

import { normalizeSeasonNumbers } from "@/mapping/season-numbers";
import type { SeerrSeasonStatus } from "@/providers/seerr/types";

export type SeerrRequestScope = "mapped" | "all";

export type SeerrRequestScopeDecision = {
	canChooseScope: boolean;
	canRequestWholeSeries: boolean;
	mappedSeasons: number[];
	defaultScope: SeerrRequestScope;
};

export function getSeerrRequestScopeDecision(input: {
	partialRequestsEnabled: boolean;
	enableSpecialEpisodes: boolean;
	mappedSeasons: readonly number[];
	seasons: readonly SeerrSeasonStatus[];
}): SeerrRequestScopeDecision {
	const requestableSeasons = input.seasons.filter(
		(season) =>
			season.requestable &&
			season.episodeCount !== 0 &&
			(input.enableSpecialEpisodes || season.seasonNumber !== 0),
	);
	const requestableSeasonNumbers = new Set(
		requestableSeasons.map((season) => season.seasonNumber),
	);
	const mappedSeasons = normalizeSeasonNumbers(input.mappedSeasons);
	const mappedSeasonsAreRequestable =
		mappedSeasons.length > 0 &&
		mappedSeasons.every((season) => requestableSeasonNumbers.has(season));
	const canChooseScope =
		input.partialRequestsEnabled &&
		mappedSeasonsAreRequestable &&
		requestableSeasons.length > 1;

	return {
		canChooseScope,
		canRequestWholeSeries: requestableSeasons.length > 0,
		mappedSeasons,
		defaultScope: canChooseScope ? "mapped" : "all",
	};
}
