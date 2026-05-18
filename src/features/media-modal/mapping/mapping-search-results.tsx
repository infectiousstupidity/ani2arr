/** Dumb mapping candidate row UI for provider mapping panels. */
// src/features/media-modal/mapping/mapping-search-results.tsx

import { ExternalLink } from "lucide-react";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";

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

function getLinkedWarning(linkedAniListCount: number | undefined): string | null {
	if (!linkedAniListCount) return null;

	return `Linked to ${linkedAniListCount} AniList entr${
		linkedAniListCount === 1 ? "y" : "ies"
	}`;
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
