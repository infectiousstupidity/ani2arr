/** Opens extension options-page sections through the background tab launcher. */
// src/rpc/runtime-messages.ts

import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist/types";

type OptionsPageSectionId =
	| "sonarr"
	| "radarr"
	| "seerr"
	| "mappings"
	| "ui"
	| "advanced";

interface OpenOptionsPageInput {
	sectionId?: OptionsPageSectionId;
	targetAnilistId?: AniListId;
	enableSeerrCsrf?: boolean;
}

export function openOptionsPage(input: OpenOptionsPageInput = {}): void {
	void browser.runtime
		.sendMessage({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			...(input.sectionId ? { sectionId: input.sectionId } : {}),
			...(input.targetAnilistId
				? { targetAnilistId: input.targetAnilistId }
				: {}),
			...(input.enableSeerrCsrf ? { enableSeerrCsrf: true } : {}),
			timestamp: Date.now(),
		})
		.catch(() => {});
}
