/** RPC handlers for AniList media fetch, search, and metadata flows. */
// src/rpc/handlers/anilist.handlers.ts

import * as v from "valibot";
import { AniListIdSchema, type AniListId } from "@/anilist/anilist-id";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import {
	anilistMediaService,
	anilistMetadataStore,
} from "@/background/api-services";
import {
	FetchAniListMediaInputSchema,
	GetAniListMetadataInputSchema,
	PrefetchAniListMediaInputSchema,
} from "@/rpc/schemas";

export const anilistHandlers = {
	async prefetchAniListMedia(ids: unknown) {
		const parsedIds = v.parse(PrefetchAniListMediaInputSchema, ids);
		const map = await anilistMediaService.fetchMediaBatch(parsedIds, {
			priority: "low",
			source: "browse-prefetch",
		});
		const results: Array<[AniListId, AniListMedia]> = [];
		for (const [anilistId, media] of map.entries()) {
			results.push([v.parse(AniListIdSchema, anilistId), media]);
		}
		return results;
	},

	async fetchAniListMedia(anilistId: unknown) {
		const parsedAniListId = v.parse(FetchAniListMediaInputSchema, anilistId);
		const media = await anilistMediaService.fetchMediaWithRelations(
			parsedAniListId,
			{
				priority: "high",
				source: "media-modal",
			},
		);
		return media ?? null;
	},

	async getAniListMetadata(input: unknown) {
		const parsedInput = v.parse(GetAniListMetadataInputSchema, input);

		if (parsedInput.ids.length === 0) {
			return { metadata: [], missingIds: [] };
		}

		const result = await anilistMetadataStore.getMetadata(parsedInput.ids, {
			refreshStale: parsedInput.refreshStale ?? true,
			fetchMissing: parsedInput.fetchMissing ?? true,
			...(typeof parsedInput.maxBatch === "number"
				? { maxBatch: parsedInput.maxBatch }
				: {}),
		});

		return {
			metadata: result.metadata,
			...(Array.isArray(result.missingIds) && result.missingIds.length > 0
				? { missingIds: result.missingIds }
				: {}),
		};
	},
};
