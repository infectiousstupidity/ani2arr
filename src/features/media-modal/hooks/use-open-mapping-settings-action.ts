/** Opens the options page mapping section from content-launched media modals. */
// src/features/media-modal/hooks/use-open-mapping-settings-action.ts

import { useCallback } from "react";
import { browser } from "wxt/browser";

import type { AniListId } from "@/anilist";

interface UseOpenMappingSettingsActionInput {
	anilistId: AniListId;
	openSource: string | null | undefined;
}

export function useOpenMappingSettingsAction({
	anilistId,
	openSource,
}: UseOpenMappingSettingsActionInput): (() => void) | null {
	const openSettings = useCallback(() => {
		void browser.runtime
			.sendMessage({
				_a2a: true,
				type: "OPEN_OPTIONS_PAGE",
				sectionId: "mappings",
				targetAnilistId: anilistId,
			})
			.catch(() => {});
	}, [anilistId]);

	return openSource === "content" ? openSettings : null;
}
