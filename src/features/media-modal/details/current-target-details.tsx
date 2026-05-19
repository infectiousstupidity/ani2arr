/** Renders current provider target facts and linked AniList entries in the media modal. */
// src/features/media-modal/details/current-target-details.tsx

import type { AniListId } from "@/anilist";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { MediaModalTargetSummary } from "../types";
import { MappingLinkedEntries } from "./linked-entries";

type MappingDetailsLinkedAniListEntry =
	MappingDetailsPayload["linkedAniListEntries"][number];

type CurrentTargetDetailsProps = {
	aniListEntryId: AniListId;
	effectiveMapping: MediaModalTargetSummary | null;
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
};

type MappingDetailRow = {
	label: string;
	value: string;
};

function formatDetailValue(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDetailRows(mapping: MediaModalTargetSummary): MappingDetailRow[] {
	const rows: MappingDetailRow[] = [
		{ label: "In library", value: mapping.isInLibrary ? "Yes" : "No" },
	];

	if (mapping.provider === "sonarr") {
		if (mapping.episodeCount !== undefined) {
			rows.push({ label: "Episodes", value: String(mapping.episodeCount) });
		}

		if (mapping.episodeFileCount !== undefined) {
			rows.push({
				label: "Episode files",
				value: String(mapping.episodeFileCount),
			});
		}
	} else {
		if (mapping.runtimeMinutes !== undefined) {
			rows.push({ label: "Runtime", value: `${mapping.runtimeMinutes} min` });
		}

		if (mapping.hasFile !== undefined) {
			rows.push({ label: "File", value: mapping.hasFile ? "Yes" : "No" });
		}
	}

	if (mapping.typeLabel) {
		rows.push({ label: "Type", value: formatDetailValue(mapping.typeLabel) });
	}

	if (mapping.statusLabel) {
		rows.push({
			label: "Status",
			value: formatDetailValue(mapping.statusLabel),
		});
	}

	return rows;
}

export function CurrentTargetDetails(
	props: CurrentTargetDetailsProps,
): React.JSX.Element {
	const { aniListEntryId, effectiveMapping, linkedAniListEntries } = props;
	const detailRows = effectiveMapping ? getDetailRows(effectiveMapping) : [];

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pr-1">
			{detailRows.length > 0 ? (
				<div className="rounded-xl border border-border-primary/50 bg-bg-primary/14 p-3">
					<div className="min-w-0 flex-1 space-y-2">
						{detailRows.map((row) => (
							<div
								key={row.label}
								className="flex items-baseline justify-between gap-4 text-sm"
							>
								<span className="text-text-secondary">{row.label}</span>
								<span className="text-right font-medium text-text-primary">
									{row.value}
								</span>
							</div>
						))}
					</div>
				</div>
			) : null}

			<MappingLinkedEntries
				className="flex min-h-0 flex-1 flex-col space-y-2"
				currentAniListId={aniListEntryId}
				entries={linkedAniListEntries}
			/>
		</div>
	);
}
