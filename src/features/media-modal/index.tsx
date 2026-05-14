/** Public media modal entry point. */
// src/features/media-modal/index.tsx

import { ProviderModal } from "./provider-modal";
import type { MediaModalProps } from "./types";

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
	const { state, ...sharedProps } = props;

	if (!state) {
		return null;
	}

	const modalKey = `${state.provider}-${state.anilistId}`;

	return <ProviderModal key={modalKey} {...sharedProps} state={state} />;
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
