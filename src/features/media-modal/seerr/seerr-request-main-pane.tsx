/** Seerr request action pane with errors, season selection, and notices. */
// src/features/media-modal/seerr/seerr-request-main-pane.tsx

import type { SeerrMediaDetails } from "@/providers/seerr/types";
import type { SeerrRequestTarget } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import { SeerrSeasonRows } from "./seerr-season-rows";

export function SeerrRequestMainPane(props: {
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	isLoading: boolean;
	errorMessage: string | null;
	selectedSeasons: readonly number[];
	isConfigured: boolean;
	requestError: string | null;
	onSelectAllRequestable: () => void;
	onToggleSeason: (seasonNumber: number) => void;
}): React.JSX.Element {
	const {
		target,
		details,
		isLoading,
		errorMessage,
		selectedSeasons,
		isConfigured,
		requestError,
		onSelectAllRequestable,
		onToggleSeason,
	} = props;

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

			{target?.mediaType === "tv" ? (
				<>
					{isLoading ? (
						<p className="mt-3 rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
							Checking Seerr...
						</p>
					) : null}
					<div className="mt-3 flex items-center justify-between gap-2 first:mt-0">
						<p className="text-xs font-semibold text-text-primary">
							Select seasons to request
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 rounded-lg px-2 text-xs"
							onClick={onSelectAllRequestable}
						>
							All requestable seasons
						</Button>
					</div>
					<div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
						<SeerrSeasonRows
							seasons={details?.seasons ?? []}
							selectedSeasons={selectedSeasons}
							onToggleSeason={onToggleSeason}
						/>
					</div>
				</>
			) : (
				<div className="mt-3 rounded-xl border border-border-primary/55 bg-bg-secondary/35 p-4 text-sm text-text-secondary">
					Movie requests use Seerr defaults. Review target, then request.
				</div>
			)}

			{isConfigured ? null : (
				<p className="mt-3 rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-3 text-sm text-text-secondary">
					Configure Seerr before requesting.
				</p>
			)}
		</div>
	);
}
