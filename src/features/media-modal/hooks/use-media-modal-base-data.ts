/** Shared AniList/options base data for Sonarr and Radarr media modal hooks. */
// src/features/media-modal/hooks/use-media-modal-base-data.ts

import { useMemo } from "react";
import type { AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import { useAniListMedia, useAniListMetadataBatch } from "@/queries/anilist";
import { useMyAnimeListMetadata } from "@/queries/myanimelist";
import { usePublicOptions } from "@/queries/options";
import { resolveMediaModalMetadata } from "../anilist-modal-data";
import type { MediaModalMetadataHint } from "../types";

export function useMediaModalBaseData(input: {
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
	fallbackLabel?: string | undefined;
	metadataHint: MediaModalMetadataHint | null;
}) {
	const { source, fallbackLabel, metadataHint } = input;
	const anilistId = source.source === "anilist" ? source.id : undefined;
	const malId = source.source === "mal" ? source.id : undefined;
	const { data: options } = usePublicOptions();
	const metadataBatch = useAniListMetadataBatch(
		anilistId === undefined ? [] : [anilistId],
		{ enabled: anilistId !== undefined },
	);
	const { data: metadataBatchData } = metadataBatch;
	const { data: anilistMedia } = useAniListMedia(anilistId, {
		enabled: anilistId !== undefined,
	});
	const myAnimeListMetadataQuery = useMyAnimeListMetadata(malId, {
		enabled: malId !== undefined,
	});
	const preferredTitleLanguage =
		options?.ui.preferredAniListTitleLanguage ?? "english";

	const resolved = useMemo(
		() =>
			resolveMediaModalMetadata({
				source,
				...(anilistId === undefined ? {} : { anilistId }),
				...(fallbackLabel === undefined ? {} : { fallbackLabel }),
				anilistMedia,
				metadataBatchData,
				myAnimeListMetadata: myAnimeListMetadataQuery.data,
				metadataHint,
				preferredTitleLanguage,
			}),
		[
			anilistId,
			anilistMedia,
			fallbackLabel,
			metadataBatchData,
			metadataHint,
			myAnimeListMetadataQuery.data,
			preferredTitleLanguage,
			source,
		],
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
		statusReady:
			source.source === "mal" || metadataBatch.isFetched || metadataBatch.isError,
		statusTitle: resolved.statusTitle,
	};
}
