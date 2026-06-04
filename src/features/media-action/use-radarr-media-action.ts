/** Radarr media-action workflow shared by AniList browse overlays and anime-page buttons. */
// src/features/media-action/use-radarr-media-action.ts

import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import { parseTmdbIdOrNull, type TmdbId } from "@/providers/schemas";
import { useAddMovie, useMovieStatus } from "@/queries/radarr";
import {
	buildMediaActionStatusQuery,
	type MediaAction,
	type MediaActionInputBase,
	useMediaAction,
} from "./use-media-action";

type RadarrMediaActionInput = MediaActionInputBase<RadarrFormState>;
export type RadarrMediaAction = MediaAction;

type AddMovieMutation = ReturnType<typeof useAddMovie>;

function quickAdd(input: {
	mediaInput: RadarrMediaActionInput;
	tmdbId: TmdbId | null;
	addMovie: AddMovieMutation;
}): void {
	if (
		input.mediaInput.providerTitle === null ||
		input.mediaInput.defaultForm === null ||
		input.tmdbId === null
	) return;

	input.addMovie.mutate({
		anilistId: input.mediaInput.anilistId,
		tmdbId: input.tmdbId,
		title: input.mediaInput.providerTitle,
		primaryTitleHint: input.mediaInput.providerTitle,
		metadata: input.mediaInput.metadata,
		form: { ...input.mediaInput.defaultForm },
	});
}

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
			quickAdd({
				mediaInput: input,
				tmdbId,
				addMovie,
			});
		},
	});
}
