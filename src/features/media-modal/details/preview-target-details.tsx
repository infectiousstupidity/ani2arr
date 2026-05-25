/** Renders selected provider candidate support details and linked AniList entries in the media modal. */
// src/features/media-modal/details/preview-target-details.tsx

import type { AniListId } from "@/anilist";
import type { MediaModalTargetSummary } from "../types";
import { MappingLinkedEntries } from "./linked-entries";
import { TargetDetailsCard } from "./target-details-card";

type PreviewTargetDetailsProps = {
	aniListEntryId: AniListId;
	previewMapping: MediaModalTargetSummary;
};

export function PreviewTargetDetails(
	props: PreviewTargetDetailsProps,
): React.JSX.Element {
	const {
		aniListEntryId,
		previewMapping,
	} = props;

	return (
		<div className="flex min-h-full flex-col gap-4">
			<TargetDetailsCard mapping={previewMapping} />

			<MappingLinkedEntries
				currentAniListId={aniListEntryId}
				linkedAniListIds={previewMapping.linkedAniListIds ?? []}
			/>
		</div>
	);
}
