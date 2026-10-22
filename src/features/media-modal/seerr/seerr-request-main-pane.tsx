/** Seerr request action pane with errors, season selection, and notices. */
// src/features/media-modal/seerr/seerr-request-main-pane.tsx

import type { SeerrMediaDetails } from "@/providers/seerr/types";
import type { SeerrRequestTarget } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import { SeerrSeasonRows } from "./seerr-season-rows";
import { isSelectableSeerrSeason } from "./seerr-selection";

export function SeerrRequestMainPane(props: {
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	isLoading: boolean;
	errorMessage: string | null;
	partialRequestsEnabled: boolean;
	enableSpecialEpisodes: boolean;
	selectedSeasons: readonly number[];
	requestError: string | null;
	connectionActionLabel: string | null;
	onConnectionAction: () => void;
	onSelectAllRequestable: () => void;
	onToggleSeason: (seasonNumber: number) => void;
}): React.JSX.Element {
	const {
		target,
		details,
		isLoading,
		errorMessage,
		partialRequestsEnabled,
		enableSpecialEpisodes,
		selectedSeasons,
		requestError,
		connectionActionLabel,
		onConnectionAction,
		onSelectAllRequestable,
		onToggleSeason,
	} = props;
	const seasons = (details?.seasons ?? []).filter(
		(season) => enableSpecialEpisodes || season.seasonNumber !== 0,
	);
	const hasSelectableSeasons = seasons.some((season) => isSelectableSeerrSeason(season));

	return (
		<div className="flex h-80 min-h-0 flex-col overflow-hidden pt-4 md:h-full">
			{errorMessage ? (
				<p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
					{errorMessage}
				</p>
			) : null}

			{requestError ? (
				<p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
					{requestError}
				</p>
			) : null}

			{connectionActionLabel ? (
				<div className="mt-3">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onConnectionAction}
					>
						{connectionActionLabel}
					</Button>
				</div>
			) : null}

			{target?.mediaType === "tv" ? (
				<>
					{isLoading ? (
						<p className="mt-3 rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
							Checking Seerr...
						</p>
					) : null}

					{!isLoading && !errorMessage && partialRequestsEnabled ? (
						<>
							<div className="mt-3 flex items-center justify-between gap-2 first:mt-0">
								<p className="text-xs font-semibold text-text-primary">
									Select seasons to request
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 rounded-lg px-2 text-xs"
									disabled={!hasSelectableSeasons}
									onClick={onSelectAllRequestable}
								>
									Select all
								</Button>
							</div>
							<div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
								<SeerrSeasonRows
									seasons={seasons}
									selectedSeasons={selectedSeasons}
									onToggleSeason={onToggleSeason}
								/>
							</div>
						</>
					) : null}

					{!isLoading && !errorMessage && !partialRequestsEnabled ? (
						<div className="mt-3 rounded-xl border border-border-primary/55 bg-bg-secondary/35 p-4 text-sm text-text-secondary">
							Seerr partial requests are disabled. This request covers the whole
							series.
						</div>
					) : null}
				</>
			) : (target?.mediaType === "movie" ? (
				<div className="mt-3 rounded-xl border border-border-primary/55 bg-bg-secondary/35 p-4 text-sm text-text-secondary">
					Movie requests use Seerr defaults. Review the target, then request.
				</div>
			) : null)}
		</div>
	);
}
