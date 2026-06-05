/** Dumb mapping candidate row UI for provider mapping panels. */
// src/features/media-modal/mapping/mapping-search-results.tsx

import { ExternalLink } from "lucide-react";
import type { MouseEvent } from "react";
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
	openProvider?: (() => void) | undefined;
	libraryLabel?: string | null | undefined;
	linkedAniListCount?: number | undefined;
	posterUrl?: string | undefined;
	typeLabel?: string | undefined;
	year?: number | undefined;
};

const BADGE_CLASS =
	"inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium leading-none";

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
		openProvider,
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
	const handleOpenProvider = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!event.isTrusted) return;

		openProvider?.();
	};

	return (
		<div
			className="group relative h-[120px] overflow-hidden rounded-lg border border-transparent p-0 transition-[background-color,border-color] hover:border-border-primary/45 hover:bg-bg-tertiary/50 focus-within:border-accent-primary/45 focus-within:bg-bg-tertiary/45"
		>
			{isSelected ? (
				<div
					className="pointer-events-none absolute inset-0 rounded-lg border border-accent-primary/45 bg-accent-primary/10 transition-[background-color,border-color]"
				/>
			) : null}
			<button
				type="button"
				className="relative z-10 flex h-full w-full min-w-0 cursor-pointer items-stretch text-left"
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
			{openProvider ? (
				<TooltipWrapper content={externalLabel} container={contentContainer}>
					<button
						type="button"
						className={cn(
							"absolute right-2 top-2 z-20 inline-flex h-7 w-7 scale-[0.92] cursor-pointer items-center justify-center rounded-full text-text-secondary opacity-0 transition-[opacity,transform,color,background-color] duration-150 hover:bg-bg-tertiary/70 hover:text-accent-primary focus-visible:bg-bg-tertiary/70 focus-visible:text-accent-primary group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100",
							isSelected ? "scale-100 opacity-100" : null,
						)}
						onClick={handleOpenProvider}
						aria-label={externalLabel}
					>
						<ExternalLink className="h-4 w-4" />
					</button>
				</TooltipWrapper>
			) : null}
		</div>
	);
}
