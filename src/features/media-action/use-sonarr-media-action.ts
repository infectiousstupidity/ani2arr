/** Sonarr media-action workflow shared by AniList browse overlays and anime-page buttons. */
// src/features/media-action/use-sonarr-media-action.ts

import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbIdOrNull } from "@/providers/schemas";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { useAddSeries, useSeriesStatus } from "@/queries/sonarr";
import {
	buildMediaActionStatusQuery,
	quickAddArrMedia,
	type MediaAction,
	type MediaActionInputBase,
	useMediaAction,
} from "./use-media-action";

type SonarrMediaActionInput = MediaActionInputBase<SonarrFormState>;
export type SonarrMediaAction = MediaAction;

export function useSonarrMediaAction(
	input: SonarrMediaActionInput,
): SonarrMediaAction {
	const statusQuery = buildMediaActionStatusQuery(input);
	const seriesStatus = useSeriesStatus(
		statusQuery.payload,
		statusQuery.options,
	);
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
			if (tvdbId !== null)
				quickAddArrMedia(input, (details) =>
					addSeries.mutate({ ...details, tvdbId }),
				);
		},
	});
}
