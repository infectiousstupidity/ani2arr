/** AniList row renderer and quick actions for the options mapping page. */
// src/options-page/pages/mappings/mappings-anilist-row.tsx

import { EyeOff, ImageOff, Loader2, RotateCcw, Unlink } from "lucide-react";
import type { AniListMetadata } from "@/anilist/types";
import { resolveTitlePreference } from "@/anilist/title";
import type { AniListTitleLanguage } from "@/anilist/title";
import Button from "@/shared/ui/primitives/button";
import { cn } from "@/shared/utils/cn";
import { Tooltip } from "../../components/ui/tooltip";
import type {
	ClearMatchAction,
	IgnoreAction,
	MappingRow,
} from "./mapping-page-model";
import {
	formatAniListToken,
	formatMappingEntryKind,
	formatMappingStatusLabel,
	formatProviderIdLabel,
} from "./mapping-page-model";

interface MappingsAniListRowProps {
	row: MappingRow;
	metadata: AniListMetadata | null;
	isPending: boolean;
	isHighlighted: boolean;
	preferredTitleLanguage?: AniListTitleLanguage;
	onIgnore: (row: MappingRow, action: IgnoreAction) => void;
	onClearMatch: (row: MappingRow, action: ClearMatchAction) => void;
	onEdit: (row: MappingRow) => void;
}

const STATUS_DOT_CLASS: Record<MappingRow["mappingRowStatus"], string> = {
	"needs-review": "bg-warning",
	"in-library": "bg-success",
	"can-add": "bg-accent-primary",
	suppressed: "bg-text-secondary",
	unmapped: "bg-warning",
	unknown: "bg-text-secondary",
};

const getRowTitle = (
	row: MappingRow,
	metadata: AniListMetadata | null,
	preferredTitleLanguage: AniListTitleLanguage,
): string =>
	resolveTitlePreference({
		titles: metadata?.titles ?? null,
		preferred: preferredTitleLanguage,
		fallback: row.providerMeta?.title ?? `AniList #${row.anilistId}`,
	}).primary;

const getMetaLine = (row: MappingRow, metadata: AniListMetadata | null): string => {
	const parts: string[] = [`AniList #${row.anilistId}`];
	if (metadata?.format) parts.push(formatAniListToken(metadata.format));
	if (typeof metadata?.seasonYear === "number") {
		parts.push(String(metadata.seasonYear));
	}
	parts.push(formatProviderIdLabel(row.provider, row.providerId));
	return parts.join(" • ");
};

const getCoverUrl = (metadata: AniListMetadata | null): string | null =>
	metadata?.coverImage?.large ?? metadata?.coverImage?.medium ?? null;

const getClearMatchTitle = (action: ClearMatchAction): string => {
	if (action.kind === "clear-manual") return "Clear manual match";
	if (action.kind === "clear-rejected") return "Restore rejected candidate";
	return "Not this match";
};

const getIgnoreAction = (row: MappingRow): IgnoreAction =>
	row.result.kind === "ignored"
		? { kind: "clear-ignore", anilistId: row.anilistId, provider: row.provider }
		: { kind: "set-ignore", anilistId: row.anilistId, provider: row.provider };

const getClearMatchAction = (row: MappingRow): ClearMatchAction | null => {
	if (row.result.kind === "mapped" && row.result.source === "manual") {
		return {
			kind: "clear-manual",
			anilistId: row.anilistId,
			provider: row.provider,
		};
	}
	if (row.result.kind === "mapped" && row.result.source === "auto") {
		return {
			kind: "reject-candidate",
			anilistId: row.anilistId,
			provider: row.provider,
			providerId: row.result.providerId,
		};
	}
	if (row.result.kind === "unmapped" && row.result.rejectedProviderIds?.[0]) {
		return {
			kind: "clear-rejected",
			anilistId: row.anilistId,
			provider: row.provider,
			providerId: row.result.rejectedProviderIds[0],
		};
	}
	return null;
};

export function MappingsAniListRow(
	props: MappingsAniListRowProps,
): React.JSX.Element {
	const {
		row,
		metadata,
		isPending,
		isHighlighted,
		preferredTitleLanguage = "english",
		onIgnore,
		onClearMatch,
		onEdit,
	} = props;
	const ignoreAction = getIgnoreAction(row);
	const clearMatchAction = getClearMatchAction(row);
	const coverUrl = getCoverUrl(metadata);
	const title = getRowTitle(row, metadata, preferredTitleLanguage);
	const showRowStatus = row.mappingRowStatus !== "in-library";
	const ignoreTitle =
		ignoreAction.kind === "clear-ignore"
			? "Remove title ignore"
			: "Ignore this title";

	let ignoreIcon: React.JSX.Element;
	if (isPending) {
		ignoreIcon = <Loader2 className="h-4 w-4 animate-spin" />;
	} else if (ignoreAction.kind === "clear-ignore") {
		ignoreIcon = <RotateCcw className="h-4 w-4" />;
	} else {
		ignoreIcon = <EyeOff className="h-4 w-4" />;
	}

	let clearMatchIcon: React.JSX.Element | null = null;
	if (clearMatchAction) {
		if (isPending) {
			clearMatchIcon = <Loader2 className="h-4 w-4 animate-spin" />;
		} else if (clearMatchAction.kind === "clear-rejected") {
			clearMatchIcon = <RotateCcw className="h-4 w-4" />;
		} else {
			clearMatchIcon = <Unlink className="h-4 w-4" />;
		}
	}

	return (
		<div
			className={cn(
				"grid gap-3 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_170px_150px] md:items-center md:gap-6 md:pl-10",
				"hover:bg-bg-tertiary/30",
				isPending && "opacity-50",
				isHighlighted && "bg-accent-primary/10",
			)}
		>
			<div className="flex min-w-0 items-center gap-4">
				<div className="flex aspect-2/3 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-primary/70 text-text-secondary">
					{coverUrl ? (
						<img
							src={coverUrl}
							alt=""
							className="h-full w-full object-cover"
							draggable={false}
							loading="lazy"
							decoding="async"
						/>
					) : (
						<ImageOff className="h-4 w-4" />
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-text-primary">
						{title}
					</p>
					<p className="mt-1 truncate text-xs text-text-secondary">
						{getMetaLine(row, metadata)}
					</p>
				</div>
			</div>

			<div className="min-w-0">
				{showRowStatus ? (
					<div className="flex items-center gap-2 text-sm text-text-primary">
						<span
							className={cn(
								"h-2 w-2 shrink-0 rounded-full",
								STATUS_DOT_CLASS[row.mappingRowStatus],
							)}
						/>
						<span className="truncate">
							{formatMappingStatusLabel(row.mappingRowStatus)}
						</span>
					</div>
				) : null}
				<p
					className={cn(
						"truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary",
						showRowStatus && "mt-1",
					)}
				>
					{formatMappingEntryKind(row.result)}
				</p>
			</div>

			<div className="flex items-center justify-end gap-1.5">
				<Tooltip content={ignoreTitle}>
					<button
						type="button"
						onClick={() => onIgnore(row, ignoreAction)}
						disabled={isPending}
						className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary/70 hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
						aria-label={ignoreTitle}
					>
						{ignoreIcon}
					</button>
				</Tooltip>
				{clearMatchAction ? (
					<Tooltip content={getClearMatchTitle(clearMatchAction)}>
						<button
							type="button"
							onClick={() => onClearMatch(row, clearMatchAction)}
							disabled={isPending}
							className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary/70 hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
							aria-label={getClearMatchTitle(clearMatchAction)}
						>
							{clearMatchIcon}
						</button>
					</Tooltip>
				) : null}
				<Button
					type="button"
					variant="outline"
					onClick={() => onEdit(row)}
					disabled={isPending}
					className="h-9 gap-2 px-3 text-xs"
				>
					Edit
				</Button>
			</div>
		</div>
	);
}
