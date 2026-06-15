/** Public media modal entry point. */
// src/features/media-modal/index.tsx

import { ConfirmProvider } from "@/shared/ui/feedback/confirm-provider";
import { RadarrModal } from "./radarr/radarr-modal";
import { SeerrModal } from "./seerr/seerr-modal";
import { SonarrModal } from "./sonarr/sonarr-modal";
import type { MediaModalProps } from "./types";

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
	const { state, container, ...sharedProps } = props;

	if (!state) {
		return null;
	}

	const modalKey =
		state.kind === "provider"
			? `${state.provider}-${state.anilistId}`
			: `seerr-${state.anilistId}`;
	let modal: React.JSX.Element;
	if (state.kind === "seerr") {
		modal = (
			<SeerrModal
				key={modalKey}
				{...sharedProps}
				container={container}
				state={state}
			/>
		);
	} else if (state.provider === "radarr") {
		modal = (
			<RadarrModal
				key={modalKey}
				{...sharedProps}
				container={container}
				state={state}
			/>
		);
	} else {
		modal = (
			<SonarrModal
				key={modalKey}
				{...sharedProps}
				container={container}
				state={state}
			/>
		);
	}

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
	SeerrMediaModalState,
} from "./types";
