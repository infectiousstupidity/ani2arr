/** Seerr request info pane with current target details and linked AniList entries. */
// src/features/media-modal/seerr/seerr-request-info-pane.tsx

import type { AniListId } from "@/anilist/types";
import type { SeerrMediaDetails } from "@/providers/seerr/types";
import type {
	MappingDetailsLinkedAniListEntry,
	SeerrRequestTarget,
} from "@/rpc/types";
import { MappingLinkedEntries } from "../details/linked-entries";
import { RIGHT_PANE_SCROLL_CLASS } from "./seerr-modal.constants";
import { SeerrDetailCard } from "./seerr-detail-card";

export function SeerrRequestInfoPane(props: {
	anilistId: AniListId;
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
	isLoading: boolean;
}): React.JSX.Element {
	const { anilistId, target, details, linkedAniListEntries, isLoading } = props;
	const targetFallbackTitle = target
		? `${target.mediaType === "movie" ? "Movie" : "TV"} TMDB ID: ${target.tmdbId}`
		: "";
	const tvdbId =
		details?.tvdbId ?? (target?.mediaType === "tv" ? target.tvdbId : undefined);

	return (
		<div className={RIGHT_PANE_SCROLL_CLASS}>
			<p className="text-sm font-semibold text-text-primary">
				Current Mapping Details
			</p>
			{isLoading ? (
				<p className="rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
					Checking Seerr...
				</p>
			) : null}
			{target ? (
				<SeerrDetailCard
					title={details?.title ?? targetFallbackTitle}
					mediaType={target.mediaType}
					tmdbId={target.tmdbId}
					tvdbId={tvdbId}
					year={details?.year}
					overview={details?.overview}
					status={details?.status}
					source={target.source}
					seasons={details?.seasons}
				/>
			) : (
				<p className="rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
					Change target to choose where Seerr will request.
				</p>
			)}
			<MappingLinkedEntries
				currentAniListId={anilistId}
				entries={linkedAniListEntries}
				heading="AniList items also mapped to this Seerr title"
			/>
		</div>
	);
}
