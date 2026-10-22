/** Seerr TV season checkbox rows with status and episode pills. */
// src/features/media-modal/seerr/seerr-season-rows.tsx

import type { SeerrSeasonStatus } from "@/providers/seerr/types";
import Pill from "@/shared/ui/primitives/pill";
import {
	getSeerrSeasonDisplayTitle,
	isSelectableSeerrSeason,
} from "./seerr-selection";

type PillTone =
	| "muted"
	| "success"
	| "warning"
	| "info"
	| "accent"
	| "blue"
	| "default";

function getSeasonStatusLabel(
	status: SeerrSeasonStatus["status"] | undefined,
): string {
	switch (status) {
		case "available": {
			return "Available";
		}
		case "partial": {
			return "Partially available";
		}
		case "pending":
		case "processing": {
			return "Requested";
		}
		case "deleted": {
			return "Deleted";
		}
		case "deleted-or-blocked": {
			return "Blocked";
		}
		case "not-requested":
		case "unknown": {
			return "Not requested";
		}
		default: {
			return "Checking";
		}
	}
}

function getStatusTone(
	status: SeerrSeasonStatus["status"] | undefined,
): PillTone {
	switch (status) {
		case "available": {
			return "success";
		}
		case "pending":
		case "processing":
		case "partial":
		case "deleted":
		case "deleted-or-blocked": {
			return "warning";
		}
		case "not-requested":
		case "unknown": {
			return "muted";
		}
		default: {
			return "muted";
		}
	}
}

export function SeerrSeasonRows(props: {
	seasons: readonly SeerrSeasonStatus[];
	selectedSeasons: readonly number[];
	onToggleSeason: (seasonNumber: number) => void;
}): React.JSX.Element {
	const { seasons, selectedSeasons, onToggleSeason } = props;
	const selected = new Set(selectedSeasons);

	if (seasons.length === 0) {
		return (
			<div className="rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
				No seasons returned by Seerr.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{seasons.map((season) => {
				const checked = selected.has(season.seasonNumber);
				const selectable = isSelectableSeerrSeason(season);
				const label = getSeerrSeasonDisplayTitle(season);

				return (
					<label
						key={season.seasonNumber}
						className={`flex min-h-12 items-center gap-3 rounded-lg border border-border-primary/50 bg-bg-tertiary/35 px-3 py-2 text-sm ${
							selectable
								? "cursor-pointer"
								: "cursor-not-allowed opacity-60"
						}`}
					>
						<input
							type="checkbox"
							checked={checked}
							disabled={!selectable}
							onChange={() => onToggleSeason(season.seasonNumber)}
							className="h-4 w-4 accent-accent-primary"
						/>
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium text-text-primary">
								{label}
							</span>
							<span className="mt-1 flex flex-wrap gap-1.5">
								<Pill
									small
									tone={getStatusTone(season.status)}
									className="normal-case"
								>
									{getSeasonStatusLabel(season.status)}
								</Pill>
								{season.episodeCount === undefined ? null : (
									<Pill small tone="muted" className="normal-case">
										{`${season.episodeCount} eps`}
									</Pill>
								)}
							</span>
						</span>
					</label>
				);
			})}
		</div>
	);
}
