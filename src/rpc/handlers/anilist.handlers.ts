/** RPC handlers for AniList media fetch, search, and metadata flows. */
// src/rpc/handlers/anilist.handlers.ts

import type { AniListId } from "@/anilist/types";
import {
	anilistMediaService,
	anilistMetadataStore,
} from "@/background/api-services";
import type { GetAniListMetadataInput } from "@/rpc/types";

export const anilistHandlers = {
	async fetchAniListMedia(anilistId: AniListId) {
		const media = await anilistMediaService.fetchMediaWithRelations(
			anilistId,
			{
				priority: "high",
			},
		);
		return media ?? null;
	},

	async getAniListMetadata(input: GetAniListMetadataInput) {
		if (input.ids.length === 0) {
			return { metadata: [], missingIds: [] };
		}

		const result = await anilistMetadataStore.getMetadata(input.ids);

		return {
			metadata: result.metadata,
			...(Array.isArray(result.missingIds) && result.missingIds.length > 0
				? { missingIds: result.missingIds }
				: {}),
		};
	},
};
