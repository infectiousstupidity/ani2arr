import type { ReactElement } from "react";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import { ArrCardOverlay, type ArrCardOverlayProps } from "./arr-card-overlay";

export function RadarrCardOverlay(
	props: ArrCardOverlayProps<RadarrFormState>,
): ReactElement {
	return (
		<ArrCardOverlay
			{...props}
			provider="radarr"
			useAction={useRadarrMediaAction}
		/>
	);
}
