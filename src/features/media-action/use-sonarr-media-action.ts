/** Sonarr media-action workflow shared by AniList browse overlays and anime-page buttons. */
// src/features/media-action/use-sonarr-media-action.ts

import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbIdOrNull, type TvdbId } from "@/providers/schemas";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useAddSeries, useSeriesStatus } from "@/queries/sonarr";
import {
	buildMediaActionStatusQuery,
	type MediaAction,
	type MediaActionInputBase,
	useMediaAction,
} from "./use-media-action";

type SonarrMediaActionInput = MediaActionInputBase<SonarrFormState>;
export type SonarrMediaAction = MediaAction;

type AddSeriesMutation = ReturnType<typeof useAddSeries>;

function quickAdd(input: {
	mediaInput: SonarrMediaActionInput;
	tvdbId: TvdbId | null;
	addSeries: AddSeriesMutation;
}): void {
	if (
		input.mediaInput.providerTitle === null ||
		input.mediaInput.defaultForm === null ||
		input.tvdbId === null
	) return;

	input.addSeries.mutate({
		anilistId: input.mediaInput.anilistId,
		tvdbId: input.tvdbId,
		title: input.mediaInput.providerTitle,
		primaryTitleHint: input.mediaInput.providerTitle,
		metadata: input.mediaInput.metadata,
		form: { ...input.mediaInput.defaultForm },
	});
}

export function useSonarrMediaAction(
	input: SonarrMediaActionInput,
): SonarrMediaAction {
	const statusQuery = buildMediaActionStatusQuery(input);
	const seriesStatus = useSeriesStatus(statusQuery.payload, statusQuery.options);
	const addSeries = useAddSeries();
	const mapping = seriesStatus.data?.mapping;
	const tvdbId = parseTvdbIdOrNull(
		mapping?.kind === "mapped" ? mapping.providerId : undefined,
	);

	return useMediaAction({
		...input,
		provider: "sonarr",
		statusQuery: seriesStatus,
		addMutation: addSeries,
		hasProviderId: tvdbId !== null || addSeries.data?.tvdbId != null,
		providerRouteSlug: getProviderRouteSlug(
			"sonarr",
			seriesStatus.data?.series ?? addSeries.data ?? null,
		),
		runQuickAdd: () => {
			quickAdd({
				mediaInput: input,
				tvdbId,
				addSeries,
			});
		},
	});
}
