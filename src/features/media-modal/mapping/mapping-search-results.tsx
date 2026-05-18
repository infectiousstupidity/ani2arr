/** Dumb mapping search result list and candidate row UI for provider mapping panels. */
// src/features/media-modal/mapping/mapping-search-results.tsx

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { ExternalLink } from "lucide-react";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";

type MappingResultListProps = {
	providerLabel: string;
	query: string;
	showMinimumCharacterMessage: boolean;
	showSearchingState: boolean;
	showEmptyState: boolean;
	canRenderResults: boolean;
	children: React.ReactNode;
};

type MappingCandidateRowProps = {
	title: string;
	providerIdLabel: string;
	providerId: number | string;
	contentContainer: HTMLDivElement | null;
	externalLabel: string;
	isCurrent: boolean;
	isSelected: boolean;
	onSelect: () => void;
	externalUrl?: string | null | undefined;
	libraryLabel?: string | null | undefined;
	linkedAniListCount?: number | undefined;
	posterUrl?: string | undefined;
	typeLabel?: string | undefined;
	year?: number | undefined;
};

function MappingSearchState(props: { children: React.ReactNode }): React.JSX.Element {
	return (
		<div className="px-3 py-6 text-center text-xs text-text-secondary">
			{props.children}
		</div>
	);
}

function getLinkedWarning(linkedAniListCount: number | undefined): string | null {
	if (!linkedAniListCount) return null;

	return `Linked to ${linkedAniListCount} AniList entr${
		linkedAniListCount === 1 ? "y" : "ies"
	}`;
}

export function MappingResultList(
	props: MappingResultListProps,
): React.JSX.Element {
	const {
		providerLabel,
		query,
		showMinimumCharacterMessage,
		showSearchingState,
		showEmptyState,
		canRenderResults,
		children,
	} = props;

	return (
		<ScrollArea.Root className="h-full w-full">
			<ScrollArea.Viewport className="h-full w-full scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
				<div className="pb-4 pr-1">
					<div className="overflow-hidden rounded-xl border border-border-primary/60 bg-bg-secondary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
						<div className="divide-y divide-border-primary/70">
							{showMinimumCharacterMessage ? (
								<MappingSearchState>
									Enter at least 2 characters to search {providerLabel}.
								</MappingSearchState>
							) : null}

							{showSearchingState ? (
								<MappingSearchState>Searching...</MappingSearchState>
							) : null}

							{showEmptyState ? (
								<MappingSearchState>
									{query.length > 0
										? "No results found."
										: `Type to search ${providerLabel} manually.`}
								</MappingSearchState>
							) : null}

							{canRenderResults ? children : null}
						</div>
					</div>
				</div>
			</ScrollArea.Viewport>

			<ScrollArea.Scrollbar
				orientation="vertical"
				className="flex w-2.5 select-none touch-none p-0.5"
			>
				<ScrollArea.Thumb className="flex-1 rounded bg-border-primary/40" />
			</ScrollArea.Scrollbar>

			<ScrollArea.Corner />
		</ScrollArea.Root>
	);
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
		onSelect,
		externalUrl,
		libraryLabel,
		linkedAniListCount,
		posterUrl,
		typeLabel,
		year,
	} = props;
	const linkedWarning = getLinkedWarning(linkedAniListCount);

	return (
		<div
			className={`group flex items-center gap-3 border-l-2 px-3 py-3 transition-colors ${
				isSelected
					? "border-l-accent-primary bg-white/8"
					: "border-l-transparent hover:bg-bg-primary/45"
			}`}
		>
			<button
				type="button"
				className="flex flex-1 items-start gap-3 text-left"
				onClick={onSelect}
			>
				{posterUrl ? (
					<img
						src={posterUrl}
						alt="Poster"
						className="h-14 w-10 shrink-0 rounded object-cover shadow-sm"
					/>
				) : (
					<div className="h-14 w-10 shrink-0 rounded bg-bg-primary" />
				)}
				<div className="min-w-0 flex-1 space-y-2">
					<div className="text-sm font-semibold leading-tight text-text-primary line-clamp-2">
						{title}
					</div>
					<div className="flex flex-wrap items-center gap-1 text-xs text-text-secondary">
						<span className="font-mono text-text-primary">
							{providerIdLabel} {providerId}
						</span>
						{year ? (
							<>
								<span aria-hidden="true">•</span>
								<span>{year}</span>
							</>
						) : null}
						{typeLabel ? (
							<>
								<span aria-hidden="true">•</span>
								<span>{typeLabel}</span>
							</>
						) : null}
					</div>
					{linkedWarning ? (
						<div className="text-[11px] font-medium text-amber-100/85">
							{linkedWarning}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
						{isCurrent ? (
							<span className="text-success">Current match</span>
						) : null}
						{libraryLabel ? (
							<span className="text-text-secondary">{libraryLabel}</span>
						) : null}
					</div>
				</div>
			</button>
			{externalUrl ? (
				<TooltipWrapper content={externalLabel} container={contentContainer}>
					<a
						href={externalUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center rounded p-2 text-text-secondary hover:text-text-primary"
						aria-label={externalLabel}
					>
						<ExternalLink size={16} />
					</a>
				</TooltipWrapper>
			) : null}
		</div>
	);
}
