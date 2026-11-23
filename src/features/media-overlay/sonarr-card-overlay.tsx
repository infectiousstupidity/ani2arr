import type { ReactElement } from "react";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import { ArrCardOverlay, type ArrCardOverlayProps } from "./arr-card-overlay";

export function SonarrCardOverlay(
	props: ArrCardOverlayProps<SonarrFormState>,
): ReactElement {
	return (
		<ArrCardOverlay
			{...props}
			provider="sonarr"
			useAction={useSonarrMediaAction}
		/>
	);
}
