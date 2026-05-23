/** Renders other AniList entries linked to the selected provider target in the modal. */
// src/features/media-modal/details/linked-entries.tsx

import { LazyMotion, domAnimation, m } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { AniListId } from "@/anilist";
import { buildAniListAnimeUrl } from "@/anilist/anilist-links";
import type { AniListMediaFormat } from "@/anilist/schemas/media.schema";
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
	format?: AniListMediaFormat | null;
	year?: number | null;
	posterUrl?: string | null;
};

const EXTERNAL_ICON_VARIANTS = {
	hidden: { opacity: 0, scale: 0.92 },
	visible: { opacity: 1, scale: 1 },
};
const LINKED_ENTRIES_LIST_VARIANTS = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: { staggerChildren: 0.05 },
	},
};
const LINKED_ENTRY_VARIANTS = {
	hidden: { opacity: 0, y: 10 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.18 },
	},
};

function LinkedEntryLink(props: { row: LinkedEntryRow }): React.JSX.Element {
	const { row } = props;
	const [isHovered, setIsHovered] = useState(false);
	const [isFocusWithin, setIsFocusWithin] = useState(false);
	const showExternalIcon = isHovered || isFocusWithin;

	return (
		<m.a
			variants={LINKED_ENTRY_VARIANTS}
			href={buildAniListAnimeUrl(row.anilistId)}
			target="_blank"
			rel="noreferrer"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onFocusCapture={() => setIsFocusWithin(true)}
			onBlurCapture={(event) => {
				const nextTarget = event.relatedTarget;
				if (
					!(nextTarget instanceof Node) ||
					!event.currentTarget.contains(nextTarget)
				) {
					setIsFocusWithin(false);
				}
			}}
			className="relative flex items-center gap-3 rounded-lg p-2 pr-10 transition-colors hover:bg-bg-tertiary/50"
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
			<m.span
				variants={EXTERNAL_ICON_VARIANTS}
				initial={false}
				animate={showExternalIcon ? "visible" : "hidden"}
				transition={{ duration: 0.14 }}
				className="absolute right-3 top-3 text-text-secondary"
			>
				<ExternalLink className="h-4 w-4" />
			</m.span>
		</m.a>
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
	const { currentAniListId, linkedAniListIds = [], entries = [] } = props;
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
		refreshStale: false,
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

	return (
		<section className="flex flex-col gap-2 border-t border-border-primary/50 pt-4">
			<p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary/70">
				{`Mapped AniList entries (${rows.length})`}
			</p>
			<LazyMotion features={domAnimation}>
				<m.div
					key={rowsKey}
					className="flex flex-col gap-2 overflow-x-hidden"
					variants={LINKED_ENTRIES_LIST_VARIANTS}
					initial="hidden"
					animate="show"
				>
					{rows.map((row) => (
						<LinkedEntryLink key={row.anilistId} row={row} />
					))}
				</m.div>
			</LazyMotion>
		</section>
	);
}
