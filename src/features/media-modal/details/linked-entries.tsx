/** Renders other AniList entries linked to the selected provider target in the modal. */
// src/features/media-modal/details/linked-entries.tsx

import { ExternalLink } from "lucide-react";
import type {
	AniListId,
	AniListMediaFormat,
	AniListMetadata,
} from "@/anilist/types";
import { buildAniListAnimeUrl, resolveTitlePreference } from "@/anilist/title";
import type { Provider } from "@/providers/types";
import type { MappingDetailsPayload } from "@/rpc/types";
import { useAniListMetadataBatch } from "@/queries/anilist";
import { formatToken } from "../helpers";

type MappingDetailsLinkedAniListEntry =
	MappingDetailsPayload["linkedAniListEntries"][number];

interface MappingLinkedEntriesProps {
	provider?: Provider;
	currentAniListId: AniListId;
	heading?: string;
	linkedAniListIds?: readonly AniListId[];
	entries?: readonly MappingDetailsLinkedAniListEntry[];
}

type LinkedEntryRow = {
	anilistId: AniListId;
	title: string;
	format?: AniListMediaFormat | null;
	year?: number | null;
	posterUrl?: string | null;
};

function LinkedEntryLink(props: { row: LinkedEntryRow }): React.JSX.Element {
	const { row } = props;

	return (
		<a
			href={buildAniListAnimeUrl(row.anilistId)}
			target="_blank"
			rel="noreferrer"
			className="group relative flex items-center gap-3 rounded-lg p-2 pr-10 transition-colors hover:bg-bg-tertiary/50 focus-visible:bg-bg-tertiary/50"
		>
			<div className="h-14 w-10 shrink-0 rounded-md bg-bg-primary/65">
				{row.posterUrl ? (
					<img
						src={row.posterUrl}
						alt=""
						className="h-full w-full rounded-md object-cover"
					/>
				) : null}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<div className="line-clamp-1 text-sm font-medium text-text-primary">
						{row.title}
					</div>
				</div>
				<div className="mt-0.5 text-xs text-text-secondary">
					{row.format ? formatToken(row.format) : "Unknown format"}
					{row.year ? ` • ${row.year}` : ""}
				</div>
			</div>
			<span
				className="absolute right-3 top-3 scale-[0.92] text-text-secondary opacity-0 transition-[opacity,transform,color] duration-150 group-hover:scale-100 group-hover:text-accent-primary group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:text-accent-primary group-focus-visible:opacity-100"
			>
				<ExternalLink className="h-4 w-4" />
			</span>
		</a>
	);
}

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
	const {
		provider,
		currentAniListId,
		heading,
		linkedAniListIds = [],
		entries = [],
	} = props;
	const visibleEntries = entries.filter(
		(entry) =>
			entry.anilistId !== currentAniListId && entry.relation !== "current",
	);
	const shouldFetchMetadata =
		entries.length === 0 && linkedAniListIds.length > 0;
	const uniqueLinkedIds = shouldFetchMetadata
		? [
				...new Set(
					linkedAniListIds.filter(
						(anilistId) => anilistId && anilistId !== currentAniListId,
					),
				),
			]
		: [];
	const metadataQuery = useAniListMetadataBatch(uniqueLinkedIds, {
		enabled: shouldFetchMetadata,
	});

	if (visibleEntries.length === 0 && uniqueLinkedIds.length === 0) {
		return null;
	}

	if (
		shouldFetchMetadata &&
		metadataQuery.data === undefined &&
		(metadataQuery.isPending || metadataQuery.isFetching)
	) {
		return null;
	}

	const metadataById = new Map(
		(metadataQuery.data?.metadata ?? []).map((item) => [item.id, item]),
	);
	const rows: LinkedEntryRow[] =
		visibleEntries.length > 0
			? visibleEntries.map((entry) => ({
					anilistId: entry.anilistId,
					title: entry.title ?? `AniList #${entry.anilistId}`,
					format: entry.format ?? null,
					year: entry.year ?? null,
					posterUrl: entry.coverImage ?? null,
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
					};
				});
	const rowsKey = rows.map((row) => row.anilistId).join(":");
	const providerTargetLabel =
		provider === "sonarr" ? "Sonarr series" : "Radarr movie";
	const headingLabel =
		heading ??
		`AniList ID's also mapped to this ${providerTargetLabel} (${rows.length})`;

	return (
		<section className="flex flex-col gap-2 border-t border-border-primary/50 pt-4">
			<p className="shrink-0 text-xs font-semibold text-text-primary">
				{heading ? `${heading} (${rows.length})` : headingLabel}
			</p>
			<div
				key={rowsKey}
				className="a2a-stagger-list flex flex-col gap-2 overflow-x-hidden"
			>
				{rows.map((row) => (
					<LinkedEntryLink key={row.anilistId} row={row} />
				))}
			</div>
		</section>
	);
}
