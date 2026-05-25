/** Dumb mapping candidate row UI for provider mapping panels. */
// src/features/media-modal/mapping/mapping-search-results.tsx

import { m } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import { cn } from "@/shared/utils/cn";

type MappingCandidateRowProps = {
	title: string;
	providerIdLabel: string;
	providerId: number | string;
	contentContainer: HTMLDivElement | null;
	externalLabel: string;
	isCurrent: boolean;
	isSelected: boolean;
	onToggleSelection: () => void;
	externalUrl?: string | null | undefined;
	libraryLabel?: string | null | undefined;
	linkedAniListCount?: number | undefined;
	posterUrl?: string | undefined;
	typeLabel?: string | undefined;
	year?: number | undefined;
};

const BADGE_CLASS =
	"inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium leading-none";
const EXTERNAL_ICON_VARIANTS = {
	hidden: { opacity: 0, scale: 0.92 },
	visible: { opacity: 1, scale: 1 },
};
const SEARCH_RESULT_ITEM_VARIANTS = {
	hidden: { opacity: 0, y: 10 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.18 },
	},
};

function getLinkedBadgeLabel(
	linkedAniListCount: number | undefined,
): string | null {
	if (!linkedAniListCount) return null;

	return `${linkedAniListCount} linked`;
}

export function MappingCandidateRow(
	props: MappingCandidateRowProps,
): React.JSX.Element {
	const {
		title,
		providerIdLabel,
		providerId,
		contentContainer,
		externalLabel,
		isCurrent,
		isSelected,
		onToggleSelection,
		externalUrl,
		libraryLabel,
		linkedAniListCount,
		posterUrl,
		typeLabel,
		year,
	} = props;
	const linkedBadgeLabel = getLinkedBadgeLabel(linkedAniListCount);
	const selectionLabel = isSelected
		? `Clear selected match: ${title}`
		: `Preview match: ${title}`;
	const [isHovered, setIsHovered] = useState(false);
	const [isFocusWithin, setIsFocusWithin] = useState(false);
	const showExternalIcon = isSelected || isHovered || isFocusWithin;

	return (
		<m.div
			variants={SEARCH_RESULT_ITEM_VARIANTS}
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
			className="group relative h-[120px] overflow-hidden rounded-lg border border-transparent p-0 transition-[background-color,border-color] hover:border-border-primary/45 hover:bg-bg-tertiary/50 focus-within:border-accent-primary/45 focus-within:bg-bg-tertiary/45"
		>
			{isSelected ? (
				<m.div
					layoutId="active-search-highlight"
					className="pointer-events-none absolute inset-0 rounded-lg border border-accent-primary/45 bg-accent-primary/10"
					transition={{ type: "spring", stiffness: 420, damping: 34 }}
				/>
			) : null}
			<button
				type="button"
				className="relative z-10 flex h-full w-full min-w-0 items-stretch text-left"
				onClick={onToggleSelection}
				aria-label={selectionLabel}
			>
				{posterUrl ? (
					<img
						src={posterUrl}
						alt="Poster"
						loading="eager"
						decoding="async"
						className="h-full w-20 shrink-0 rounded-l-lg object-cover"
					/>
				) : (
					<div className="h-full w-20 shrink-0 rounded-l-lg bg-bg-primary" />
				)}
				<div className="flex h-full min-w-0 flex-1 flex-col py-3 pl-4 pr-12">
					<div className="text-sm font-semibold leading-tight text-text-primary line-clamp-2">
						{title}
					</div>

					<div className="mt-1 truncate text-xs text-text-secondary">
						<span>
							{providerIdLabel} {providerId}
						</span>
						{year ? (
							<>
								<span className="mx-1 opacity-30" aria-hidden="true">
									•
								</span>
								<span>{year}</span>
							</>
						) : null}
						{typeLabel ? (
							<>
								<span className="mx-1 opacity-30" aria-hidden="true">
									•
								</span>
								<span>{typeLabel}</span>
							</>
						) : null}
					</div>

					<div className="mt-auto flex h-5 flex-wrap items-end gap-1.5 overflow-hidden">
						{isCurrent ? (
							<span
								className={cn(
									BADGE_CLASS,
									"border-success/25 bg-success/15 text-success-foreground",
								)}
							>
								Current
							</span>
						) : null}
						{libraryLabel ? (
							<span
								className={cn(
									BADGE_CLASS,
									"border-success/25 bg-success/15 text-success-foreground",
								)}
							>
								{libraryLabel}
							</span>
						) : null}
						{linkedBadgeLabel ? (
							<span
								className={cn(
									BADGE_CLASS,
									"border-amber-100/25 bg-amber-100/10 text-amber-100/90",
								)}
							>
								{linkedBadgeLabel}
							</span>
						) : null}
					</div>
				</div>
			</button>
			{externalUrl ? (
				<TooltipWrapper content={externalLabel} container={contentContainer}>
					<m.a
						href={externalUrl}
						target="_blank"
						rel="noreferrer"
						variants={EXTERNAL_ICON_VARIANTS}
						initial={false}
						animate={showExternalIcon ? "visible" : "hidden"}
						transition={{ duration: 0.14 }}
						className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary/70 hover:text-accent-primary focus-visible:bg-bg-tertiary/70 focus-visible:text-accent-primary"
						aria-label={externalLabel}
					>
						<ExternalLink className="h-4 w-4" />
					</m.a>
				</TooltipWrapper>
			) : null}
		</m.div>
	);
}
