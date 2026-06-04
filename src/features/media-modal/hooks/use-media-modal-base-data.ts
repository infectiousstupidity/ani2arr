/** Shared AniList/options base data for Sonarr and Radarr media modal hooks. */
// src/features/media-modal/hooks/use-media-modal-base-data.ts

import { useMemo } from "react";
import type { AniListId } from "@/anilist/types";
import { useAniListMedia, useAniListMetadataBatch } from "@/queries/anilist";
import { usePublicOptions } from "@/queries/options";
import { resolveMediaModalMetadata } from "../anilist-modal-data";
import type { MediaModalMetadataHint } from "../types";

export function useMediaModalBaseData(input: {
	anilistId: AniListId;
	metadataHint: MediaModalMetadataHint | null;
}) {
	const { anilistId, metadataHint } = input;
	const { data: options } = usePublicOptions();
	const metadataBatch = useAniListMetadataBatch([anilistId], { enabled: true });
	const { data: metadataBatchData } = metadataBatch;
	const { data: anilistMedia } = useAniListMedia(anilistId, {
		enabled: true,
	});
	const preferredTitleLanguage =
		options?.ui.preferredAniListTitleLanguage ?? "english";

	const resolved = useMemo(
		() =>
			resolveMediaModalMetadata({
				anilistId,
				anilistMedia,
				metadataBatchData,
				metadataHint,
				preferredTitleLanguage,
			}),
		[anilistId, anilistMedia, metadataBatchData, metadataHint, preferredTitleLanguage],
	);
	const fallbackLookupTitle =
		resolved.providerPayloadTitle === undefined ||
		resolved.fallbackTitle === resolved.providerPayloadTitle
			? undefined
			: resolved.fallbackTitle;

	return {
		options,
		resolvedMetadata: resolved.resolvedMetadata,
		anilistHeaderData: resolved.anilistHeaderData,
		providerRequestTitle: resolved.providerRequestTitle,
		providerPayloadTitle: resolved.providerPayloadTitle,
		fallbackLookupTitle,
		statusMetadata: resolved.statusMetadata,
		statusReady: metadataBatch.isFetched || metadataBatch.isError,
		statusTitle: resolved.statusTitle,
	};
}
