/** RPC handler for normalized MyAnimeList metadata. */

import { myAnimeListMediaService } from "@/background/api-services";
import type { MyAnimeListId } from "@/myanimelist/types";

export const myAnimeListHandlers = {
	async getMyAnimeListMetadata(malId: MyAnimeListId) {
		return myAnimeListMediaService.getMetadata(malId);
	},
};
