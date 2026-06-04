/** Public media modal entry point. */
// src/features/media-modal/index.tsx

import { ConfirmProvider } from "@/shared/ui/feedback/confirm-provider";
import { RadarrModal } from "./radarr/radarr-modal";
import { SonarrModal } from "./sonarr/sonarr-modal";
import type { MediaModalProps } from "./types";

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
	const { state, container, ...sharedProps } = props;

	if (!state) {
		return null;
	}

	const modalKey = `${state.provider}-${state.anilistId}`;
	const modal =
		state.provider === "radarr" ? (
			<RadarrModal
				key={modalKey}
				{...sharedProps}
				container={container}
				state={state}
			/>
		) : (
			<SonarrModal
				key={modalKey}
				{...sharedProps}
				container={container}
				state={state}
			/>
		);

	return (
		<ConfirmProvider portalContainer={container ?? null}>
			{modal}
		</ConfirmProvider>
	);
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
