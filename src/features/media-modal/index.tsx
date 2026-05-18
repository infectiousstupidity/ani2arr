/** Public media modal entry point. */
// src/features/media-modal/index.tsx

import { RadarrModal } from "./radarr/radarr-modal";
import { SonarrModal } from "./sonarr/sonarr-modal";
import type { MediaModalProps } from "./types";

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
	const { state, ...sharedProps } = props;

	if (!state) {
		return null;
	}

	const modalKey = `${state.provider}-${state.anilistId}`;

	if (state.provider === "radarr") {
		return <RadarrModal key={modalKey} {...sharedProps} state={state} />;
	}

	return <SonarrModal key={modalKey} {...sharedProps} state={state} />;
}

export type { MediaModalProps } from "./types";
export type {
	AniListHeaderData,
	MediaModalMetadataHint,
	MediaModalOpenSource,
	MediaModalOpenState,
	MediaModalState,
	MediaModalView,
} from "./types";
