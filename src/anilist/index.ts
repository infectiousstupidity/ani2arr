/** Narrow public AniList domain exports for runtime composition. */
// src/anilist/index.ts

export {
	AniListIdSchema,
	isAniListId,
	parseAniListId,
	parseAniListIdOrNull,
	type AniListId,
} from "./anilist-id";
export { AniListMediaService } from "./media.service";
export { AniListMetadataStore } from "./metadata.store";
