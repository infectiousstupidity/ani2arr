/** Renders other AniList entries linked to the selected provider target in the modal. */
// src/features/media-modal/details/linked-entries.tsx

import { ExternalLink } from "lucide-react";
import type { AniListId } from "@/anilist";
import { buildAniListAnimeUrl } from "@/anilist/anilist-links";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import { resolveTitlePreference } from "@/anilist/title-preference";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { formatToken } from "../helpers";

type MappingDetailsLinkedAniListEntry =
	MappingDetailsPayload["linkedAniListEntries"][number];

interface MappingLinkedEntriesProps {
	currentAniListId: AniListId;
	linkedAniListIds?: readonly AniListId[];
	entries?: readonly MappingDetailsLinkedAniListEntry[];
}

type LinkedEntryRow = {
	anilistId: AniListId;
	title: string;
	format?: string | null;
	year?: number | null;
	posterUrl?: string | null;
	relation?: "current" | undefined;
};

function titleFromMetadata(
	metadata: AniListMetadata | undefined,
	fallback?: string,
): string {
	if (metadata?.titles) {
		return resolveTitlePreference({ titles: metadata.titles }).primary;
	}

	return fallback ?? "Unknown AniList entry";
}

export function MappingLinkedEntries(
	props: MappingLinkedEntriesProps,
): React.JSX.Element | null {
	const { currentAniListId, linkedAniListIds = [], entries = [] } = props;
	const shouldFetchMetadata =
		entries.length === 0 && linkedAniListIds.length > 0;
	const uniqueLinkedIds = shouldFetchMetadata
		? [...new Set(linkedAniListIds.filter(Boolean))]
		: [];
	const metadataQuery = useAniListMetadataBatch(uniqueLinkedIds, {
		enabled: shouldFetchMetadata,
		refreshStale: false,
	});

	if (entries.length === 0 && uniqueLinkedIds.length === 0) {
		return null;
	}

	const metadataById = new Map(
		(metadataQuery.data?.metadata ?? []).map((item) => [item.id, item]),
	);
	const rows: LinkedEntryRow[] =
		entries.length > 0
			? entries.map((entry) => ({
					anilistId: entry.anilistId,
					title: entry.title ?? `AniList #${entry.anilistId}`,
					format: entry.format ?? null,
					year: entry.year ?? null,
					posterUrl: null,
					relation: entry.relation,
				}))
			: uniqueLinkedIds.map((anilistId) => {
					const metadata = metadataById.get(anilistId);

					return {
						anilistId,
						title: titleFromMetadata(metadata, `AniList #${anilistId}`),
						format: metadata?.format ?? null,
						year: metadata?.seasonYear ?? null,
						posterUrl:
							metadata?.coverImage?.medium ?? metadata?.coverImage?.large ?? null,
						relation: undefined,
					};
				});
	const hasCurrentEntry = rows.some(
		(row) => row.anilistId === currentAniListId || row.relation === "current",
	);

	return (
		<section className="flex flex-col gap-2">
			<p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
				{hasCurrentEntry
					? "Linked AniList entries"
					: `Also linked AniList entr${rows.length === 1 ? "y" : "ies"}`}
			</p>
			<div className="overflow-x-hidden rounded-xl border border-border-primary/50 bg-bg-primary/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
				<div className="divide-y divide-border-primary/50">
					{rows.map((row) => (
						<a
							key={row.anilistId}
							href={buildAniListAnimeUrl(row.anilistId)}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-bg-primary/35"
						>
							<div className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-bg-primary/65">
								{row.posterUrl ? (
									<img
										src={row.posterUrl}
										alt=""
										className="h-full w-full object-cover"
									/>
								) : null}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<div className="truncate text-sm font-medium text-text-primary">
										{row.title}
									</div>
									{row.relation === "current" ? (
										<span className="shrink-0 rounded-full bg-accent-primary/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-primary">
											Current
										</span>
									) : null}
								</div>
								<div className="mt-0.5 text-xs text-text-secondary">
									{row.format ? formatToken(row.format) : "Unknown format"}
									{row.year ? ` • ${row.year}` : ""}
								</div>
							</div>
							<ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
						</a>
					))}
				</div>
			</div>
		</section>
	);
}
