/** RPC handlers for AniList media fetch, search, and metadata flows. */
// src/rpc/handlers/anilist.handlers.ts

import * as v from "valibot";
import { AniListIdSchema, type AniListId } from "@/anilist/anilist-id";
import type { Ani2arrApi } from "@/rpc";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import {
	FetchAniListMediaInputSchema,
	GetAniListMetadataInputSchema,
	PrefetchAniListMediaInputSchema,
} from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";

export function createAnilistHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	"prefetchAniListMedia" | "fetchAniListMedia" | "getAniListMetadata"
> {
	const { anilistMediaService, anilistMetadataStore } = deps;

	const handlers = {
		async prefetchAniListMedia(ids) {
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

		async fetchAniListMedia(anilistId) {
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

		async getAniListMetadata(input) {
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
	} satisfies Pick<
		Ani2arrApi,
		"prefetchAniListMedia" | "fetchAniListMedia" | "getAniListMetadata"
	>;

	return handlers;
}
