/** Renders current provider target facts and linked AniList entries in the media modal. */
// src/features/media-modal/details/current-target-details.tsx

import type { AniListId } from "@/anilist";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { MediaModalTargetSummary } from "../types";
import { MappingLinkedEntries } from "./linked-entries";
import { TargetDetailsCard } from "./target-details-card";

type MappingDetailsLinkedAniListEntry =
	MappingDetailsPayload["linkedAniListEntries"][number];

type CurrentTargetDetailsProps = {
	aniListEntryId: AniListId;
	effectiveMapping: MediaModalTargetSummary | null;
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
};

export function CurrentTargetDetails(
	props: CurrentTargetDetailsProps,
): React.JSX.Element {
	const {
		aniListEntryId,
		effectiveMapping,
		linkedAniListEntries,
	} = props;

	return (
		<div className="flex flex-col gap-4">
			{effectiveMapping ? <TargetDetailsCard mapping={effectiveMapping} /> : null}

			<MappingLinkedEntries
				currentAniListId={aniListEntryId}
				entries={linkedAniListEntries}
			/>
		</div>
	);
}
