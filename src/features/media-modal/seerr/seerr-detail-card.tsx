/** Seerr detail card for current and preview target display. */
// src/features/media-modal/seerr/seerr-detail-card.tsx

import type {
	SeerrMediaDetails,
	SeerrMediaType,
	SeerrSeasonStatus,
} from "@/providers/seerr/types";
import type { SeerrRequestTarget } from "@/rpc/types";
import Pill from "@/shared/ui/primitives/pill";
import { summarizeSeerrSeasonAvailability } from "./seerr-selection";

type PillTone =
	| "muted"
	| "success"
	| "warning"
	| "info"
	| "accent"
	| "blue"
	| "default";

function getStatusLabel(
	status: SeerrMediaDetails["status"] | undefined,
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
			return "Requestable";
		}
		default: {
			return "Checking";
		}
	}
}

function getStatusTone(
	status: SeerrMediaDetails["status"] | undefined,
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

function getSourceLabel(
	source: SeerrRequestTarget["source"] | undefined,
): string {
	if (source === "manual") return "Manual target";
	if (source === "anibridge") return "From AniBridge";
	return "Selected target";
}

export function SeerrDetailCard(props: {
	title: string;
	mediaType: SeerrMediaType;
	tmdbId: number;
	tvdbId?: number | undefined;
	year?: number | undefined;
	overview?: string | null | undefined;
	status?: SeerrMediaDetails["status"] | undefined;
	source?: SeerrRequestTarget["source"] | undefined;
	seasons?: readonly SeerrSeasonStatus[] | undefined;
}): React.JSX.Element {
	const {
		title,
		mediaType,
		tmdbId,
		tvdbId,
		year,
		overview,
		status,
		source,
		seasons,
	} = props;
	const summary = summarizeSeerrSeasonAvailability(seasons);

	return (
		<div className="rounded-xl border border-border-primary/55 bg-bg-secondary/35 p-4">
			<div className="flex min-w-0 flex-col gap-2">
				<p className="line-clamp-2 text-sm font-semibold text-text-primary">
					{title}
				</p>
				{year ? (
					<p className="text-xs text-text-secondary">{year}</p>
				) : null}
			</div>

			<div className="mt-3 flex flex-wrap gap-2">
				<Pill small tone="muted" className="normal-case">
					{mediaType === "movie" ? "Movie" : "TV"}
				</Pill>
				<Pill small tone="muted" className="normal-case">
					{`TMDB ID: ${tmdbId}`}
				</Pill>
				{tvdbId === undefined ? null : (
					<Pill small tone="muted" className="normal-case">
						{`TVDB ID: ${tvdbId}`}
					</Pill>
				)}
				<Pill small tone={getStatusTone(status)} className="normal-case">
					{getStatusLabel(status)}
				</Pill>
				<Pill small tone="info" className="normal-case">
					{getSourceLabel(source)}
				</Pill>
			</div>

			{summary ? (
				<div className="mt-3 flex flex-wrap gap-2">
					{summary.availableSeasonCount > 0 ? (
						<Pill small tone="success" className="normal-case">
							{`${summary.availableSeasonCount} available`}
						</Pill>
					) : null}
					{summary.partialSeasonCount > 0 ? (
						<Pill small tone="warning" className="normal-case">
							{`${summary.partialSeasonCount} partial`}
						</Pill>
					) : null}
					<Pill small tone="muted" className="normal-case">
						{`${summary.requestableSeasonCount} requestable`}
					</Pill>
					{summary.pendingSeasonCount > 0 ? (
						<Pill small tone="warning" className="normal-case">
							{`${summary.pendingSeasonCount} requested`}
						</Pill>
					) : null}
					{summary.episodeCount === undefined ? null : (
						<Pill small tone="muted" className="normal-case">
							{`${summary.episodeCount} eps`}
						</Pill>
					)}
				</div>
			) : null}

			{overview ? (
				<p className="mt-3 line-clamp-5 text-sm leading-relaxed text-text-secondary">
					{overview}
				</p>
			) : null}
		</div>
	);
}
