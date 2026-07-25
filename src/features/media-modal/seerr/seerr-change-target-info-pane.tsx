/** Seerr target preview pane with TV season draft and linked AniList entries. */
// src/features/media-modal/seerr/seerr-change-target-info-pane.tsx

import type { AniListId } from "@/anilist/types";
import type {
	SeerrMediaDetails,
	SeerrSearchResult,
} from "@/providers/seerr/types";
import type { MappingDetailsLinkedAniListEntry } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import { MappingLinkedEntries } from "../details/linked-entries";
import { SeerrDetailCard } from "./seerr-detail-card";
import { RIGHT_PANE_SCROLL_CLASS } from "./seerr-modal.constants";
import { SeerrSeasonRows } from "./seerr-season-rows";

export function SeerrChangeTargetInfoPane(props: {
	anilistId?: AniListId | undefined;
	selectedResult: SeerrSearchResult | null;
	selectedDetails: SeerrMediaDetails | null;
	draftSeasons: readonly number[];
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
	isSaving: boolean;
	saveError: string | null;
	onToggleDraftSeason: (seasonNumber: number) => void;
	onSelectAllDraftSeasons: () => void;
}): React.JSX.Element {
	const {
		anilistId,
		selectedResult,
		selectedDetails,
		draftSeasons,
		linkedAniListEntries,
		isSaving,
		saveError,
		onToggleDraftSeason,
		onSelectAllDraftSeasons,
	} = props;
	const year = selectedDetails?.year ?? selectedResult?.year;
	const overview = selectedDetails?.overview ?? selectedResult?.overview;

	return (
		<div className={RIGHT_PANE_SCROLL_CLASS}>
			<p className="text-sm font-semibold text-text-primary">
				Preview Mapping Details
			</p>
			{selectedResult ? (
				<SeerrDetailCard
					title={selectedDetails?.title ?? selectedResult.title}
					mediaType={selectedResult.mediaType}
					tmdbId={selectedResult.tmdbId}
					tvdbId={selectedDetails?.tvdbId}
					year={year}
					overview={overview}
					status={selectedDetails?.status}
					seasons={selectedDetails?.seasons}
				/>
			) : (
				<p className="rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
					Select a result. Movie results save immediately. TV results need seasons.
				</p>
			)}
			{selectedResult?.mediaType === "tv" ? (
				<div className="flex flex-col gap-3 border-t border-border-primary/50 pt-4">
					<div className="flex items-center justify-between gap-2">
						<p className="text-xs font-semibold text-text-primary">
							Manual target seasons
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 rounded-lg px-2 text-xs"
							onClick={onSelectAllDraftSeasons}
						>
							All requestable seasons
						</Button>
					</div>
					<SeerrSeasonRows
						seasons={selectedDetails?.seasons ?? []}
						selectedSeasons={draftSeasons}
						onToggleSeason={onToggleDraftSeason}
					/>
				</div>
			) : null}
			{saveError ? (
				<p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
					{saveError}
				</p>
			) : null}
			{isSaving ? (
				<p className="rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-3 text-sm text-text-secondary">
					Saving target...
				</p>
			) : null}
			<MappingLinkedEntries
				currentAniListId={anilistId}
				entries={linkedAniListEntries}
				heading="AniList items also mapped to this Seerr title"
			/>
		</div>
	);
}
