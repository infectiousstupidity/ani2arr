/** Source row renderer and quick actions for the options mapping page. */
// src/options-page/pages/mappings/mappings-source-row.tsx

import {
	EyeOff,
	ImageOff,
	Loader2,
	RotateCcw,
	SquarePen,
	Unlink,
} from "lucide-react";
import type { AniListMetadata } from "@/anilist/types";
import { buildAniListAnimeUrl, resolveTitlePreference } from "@/anilist/title";
import type { AniListTitleLanguage } from "@/anilist/title";
import Pill from "@/shared/ui/primitives/pill";
import Tooltip from "@/shared/ui/primitives/tooltip";
import { cn } from "@/shared/utils/cn";
import type {
	ClearMatchAction,
	IgnoreAction,
	MappingRow,
} from "./mapping-page-model";
import {
	formatAniListToken,
	formatMappingEntryKind,
	formatMappingStatusLabel,
	formatSourceIdentity,
	getMappingRowMutationInput,
} from "./mapping-page-model";

interface MappingsSourceRowProps {
	row: MappingRow;
	metadata: AniListMetadata | null;
	isPending: boolean;
	isHighlighted: boolean;
	preferredTitleLanguage?: AniListTitleLanguage;
	onIgnore: (row: MappingRow, action: IgnoreAction) => void;
	onClearMatch: (row: MappingRow, action: ClearMatchAction) => void;
	onEdit: (row: MappingRow) => void;
}

const STATUS_PILL_CLASS: Record<MappingRow["mappingRowStatus"], string> = {
	"needs-review": "border-warning/35 bg-warning/15 text-warning normal-case",
	"in-library": "border-success/35 bg-success/15 text-success normal-case",
	"can-add":
		"border-accent-primary/40 bg-accent-primary/15 text-accent-primary normal-case",
	suppressed:
		"border-border-primary/45 bg-bg-tertiary/20 text-text-secondary normal-case",
	unmapped: "border-warning/35 bg-warning/15 text-warning normal-case",
	unknown:
		"border-border-primary/45 bg-bg-tertiary/20 text-text-secondary normal-case",
};

const ID_PILL_CLASS =
	"border border-border-primary/45 bg-bg-tertiary/20 text-text-secondary normal-case";
const ANILIST_LINK_CLASS =
	"transition-colors hover:text-accent-primary focus-visible:text-accent-primary";
const LINK_PILL_CLASS =
	"hover:border-accent-primary/55 hover:bg-accent-primary/15 hover:text-accent-primary focus-visible:border-accent-primary/55 focus-visible:bg-accent-primary/15 focus-visible:text-accent-primary";

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

const getMetaPillLabels = (metadata: AniListMetadata | null): string[] => {
	const labels: string[] = [];
	if (metadata?.format) labels.push(formatAniListToken(metadata.format));
	if (typeof metadata?.seasonYear === "number") {
		labels.push(String(metadata.seasonYear));
	}
	return labels;
};

const getCoverUrl = (metadata: AniListMetadata | null): string | null =>
	metadata?.coverImage?.large ?? metadata?.coverImage?.medium ?? null;

const getClearMatchTitle = (action: ClearMatchAction): string => {
	if (action.kind === "clear-manual") return "Remove manual mapping override";
	if (action.kind === "clear-rejected") {
		return "Allow this rejected match again";
	}
	return "Reject this automatic match";
};

const getIgnoreAction = (row: MappingRow): IgnoreAction =>
	row.result.kind === "ignored"
		? { kind: "clear-ignore", ...getMappingRowMutationInput(row) }
		: { kind: "set-ignore", ...getMappingRowMutationInput(row) };

const getClearMatchAction = (row: MappingRow): ClearMatchAction | null => {
	if (row.result.kind === "mapped" && row.result.source === "manual") {
		return {
			kind: "clear-manual",
			...getMappingRowMutationInput(row),
		};
	}
	if (row.result.kind === "mapped" && row.result.source === "auto") {
		return {
			kind: "reject-candidate",
			...getMappingRowMutationInput(row),
			providerId: row.result.providerId,
		};
	}
	if (row.result.kind === "unmapped" && row.result.rejectedProviderIds?.[0]) {
		return {
			kind: "clear-rejected",
			...getMappingRowMutationInput(row),
			providerId: row.result.rejectedProviderIds[0],
		};
	}
	return null;
};

function MappingStatusPill(props: {
	status: MappingRow["mappingRowStatus"];
}): React.JSX.Element {
	return (
		<Pill tone="muted" className={STATUS_PILL_CLASS[props.status]}>
			{formatMappingStatusLabel(props.status)}
		</Pill>
	);
}

export function MappingsSourceRow(
	props: MappingsSourceRowProps,
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
	const anilistUrl = buildAniListAnimeUrl(row.anilistId);
	const sourceLabel = formatSourceIdentity(row.source);
	const metaPillLabels = getMetaPillLabels(metadata);
	const entryKind = formatMappingEntryKind(row.result);
	const showRowStatus = row.mappingRowStatus !== "in-library";
	const ignoreTitle =
		ignoreAction.kind === "clear-ignore"
			? "Stop ignoring this AniList title"
			: "Ignore this AniList title for this provider";

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
				"grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_170px_150px] md:items-center md:gap-6 md:pl-10",
				"hover:bg-bg-tertiary/30",
				isPending && "opacity-50",
				isHighlighted && "bg-accent-primary/10",
			)}
		>
			<div className="col-start-1 col-end-3 flex min-w-0 items-center gap-4 md:col-auto">
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
					<a
						href={anilistUrl}
						target="_blank"
						rel="noreferrer"
						className={cn(
							"block cursor-pointer truncate text-sm font-semibold text-text-primary",
							ANILIST_LINK_CLASS,
						)}
					>
						{title}
					</a>
					<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-text-secondary">
						{row.source.source === "anilist" ? (
							<a
								href={anilistUrl}
								target="_blank"
								rel="noreferrer"
								className="cursor-pointer rounded-full"
								aria-label={`Open ${sourceLabel}`}
							>
								<Pill
									small
									tone="muted"
									className={cn(ID_PILL_CLASS, LINK_PILL_CLASS)}
								>
									{sourceLabel}
								</Pill>
							</a>
						) : (
							<Pill
								small
								tone="muted"
								className={ID_PILL_CLASS}
							>
								{sourceLabel}
							</Pill>
						)}
						{metaPillLabels.map((label) => (
							<Pill key={label} small tone="muted" className={ID_PILL_CLASS}>
								{label}
							</Pill>
						))}
					</div>
					<div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden">
						{showRowStatus ? (
							<MappingStatusPill status={row.mappingRowStatus} />
						) : null}
						<span className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
							{entryKind}
						</span>
					</div>
				</div>
			</div>

			<div className="hidden min-w-0 flex-col items-center text-center md:flex">
				{showRowStatus ? (
					<MappingStatusPill status={row.mappingRowStatus} />
				) : null}
				<p
					className={cn(
						"truncate text-[11px] font-semibold uppercase tracking-wide text-text-secondary",
						showRowStatus && "mt-1",
					)}
				>
					{entryKind}
				</p>
			</div>

			<div className="col-start-3 row-start-1 flex flex-col items-end justify-center gap-1.5 md:col-auto md:row-auto md:flex-row md:items-center md:justify-end">
				<div className="flex items-center justify-end gap-1.5">
					{clearMatchAction ? (
						<Tooltip
							content={getClearMatchTitle(clearMatchAction)}
							delayDuration={200}
						>
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
					<Tooltip content={ignoreTitle} delayDuration={200}>
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
				</div>
				<Tooltip content="Edit mapping" delayDuration={200}>
					<button
						type="button"
						onClick={() => onEdit(row)}
						disabled={isPending}
						className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary/70 hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
						aria-label="Edit mapping"
					>
						<SquarePen className="h-4 w-4" />
					</button>
				</Tooltip>
			</div>
		</div>
	);
}
