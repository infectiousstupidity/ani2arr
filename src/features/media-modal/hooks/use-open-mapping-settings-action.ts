/** Opens the options page mapping section from content-launched media modals. */
// src/features/media-modal/hooks/use-open-mapping-settings-action.ts

import { useCallback } from "react";

import type { AniListId } from "@/anilist/types";
import { openOptionsPage } from "@/rpc/runtime-messages";

interface UseOpenMappingSettingsActionInput {
	anilistId?: AniListId | undefined;
	openSource: string | null | undefined;
}

export function useOpenMappingSettingsAction({
	anilistId,
	openSource,
}: UseOpenMappingSettingsActionInput): (() => void) | null {
	const openSettings = useCallback(() => {
		if (anilistId === undefined) return;
		openOptionsPage({
			sectionId: "mappings",
			targetAnilistId: anilistId,
		});
	}, [anilistId]);

	return openSource === "content" && anilistId !== undefined
		? openSettings
		: null;
}
