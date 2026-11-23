/** Radarr media-action workflow shared by AniList browse overlays and anime-page buttons. */
// src/features/media-action/use-radarr-media-action.ts

import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import { useAddMovie, useMovieStatus } from "@/queries/radarr";
import {
	buildMediaActionStatusQuery,
	quickAddArrMedia,
	type MediaAction,
	type MediaActionInputBase,
	useMediaAction,
} from "./use-media-action";

type RadarrMediaActionInput = MediaActionInputBase<RadarrFormState>;
export type RadarrMediaAction = MediaAction;

export function useRadarrMediaAction(
	input: RadarrMediaActionInput,
): RadarrMediaAction {
	const statusQuery = buildMediaActionStatusQuery(input);
	const movieStatus = useMovieStatus(statusQuery.payload, statusQuery.options);
	const addMovie = useAddMovie();
	const mapping = movieStatus.data?.mapping;
	const tmdbId = parseTmdbIdOrNull(
		mapping?.kind === "mapped" ? mapping.providerId : undefined,
	);

	return useMediaAction({
		...input,
		provider: "radarr",
		statusQuery: movieStatus,
		addMutation: addMovie,
		hasProviderId: tmdbId !== null || addMovie.data?.tmdbId != null,
		providerRouteSlug: getProviderRouteSlug(
			"radarr",
			movieStatus.data?.movie ?? addMovie.data ?? null,
		),
		runQuickAdd: () => {
			if (tmdbId !== null)
				quickAddArrMedia(input, (details) =>
					addMovie.mutate({ ...details, tmdbId }),
				);
		},
	});
}
