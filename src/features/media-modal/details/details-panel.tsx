/** Read-only right-side details panel for media modal flows. */
// src/features/media-modal/details/details-panel.tsx

import { ExternalLink, Search } from "lucide-react";
import type { AniListId } from "@/anilist";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { Provider } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import Button from "@/shared/ui/primitives/button";
import type { MediaModalTargetSummary } from "../types";
import { CurrentTargetDetails } from "./current-target-details";
import { PreviewTargetDetails } from "./preview-target-details";

export type DetailsPanelProps = {
	provider: Provider;
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
	anilistId: AniListId;
	effectiveMapping: MediaModalTargetSummary | null;
	previewMapping: MediaModalTargetSummary | null;
	isInMappingMode: boolean;
	mappingDetails?: MappingDetailsPayload | undefined;
};

function getPreviewHeading(provider: Provider): string {
	return provider === "sonarr" ? "Preview Sonarr Series" : "Preview Radarr Movie";
}

export function DetailsPanel(props: DetailsPanelProps): React.JSX.Element {
	const {
		provider,
		baseUrl,
		contentContainer,
		anilistId,
		effectiveMapping,
		previewMapping,
		isInMappingMode,
		mappingDetails,
	} = props;
	const providerLabel = getProviderLabel(provider);
	const headingLabel = isInMappingMode
		? getPreviewHeading(provider)
		: "Current Mapping Details";
	const activeTarget = isInMappingMode ? previewMapping : effectiveMapping;
	const activeTargetLink = activeTarget
		? buildProviderOpenUrl({
				provider: activeTarget.provider,
				baseUrl,
				isInLibrary: activeTarget.isInLibrary,
				...(activeTarget.providerRouteSlug
					? { providerRouteSlug: activeTarget.providerRouteSlug }
					: {}),
				searchTerm: activeTarget.title,
			})
		: null;
	let content: React.JSX.Element;

	if (isInMappingMode) {
		content = previewMapping ? (
			<PreviewTargetDetails
				aniListEntryId={anilistId}
				previewMapping={previewMapping}
			/>
		) : (
			<div className="flex min-h-65 flex-1 items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 px-6 py-8 text-center text-sm leading-relaxed text-text-secondary">
				<div className="flex max-w-72 flex-col items-center gap-3">
					<Search className="h-7 w-7 text-text-secondary" />
					<p>
						{`Select a search result to preview how it would replace the current ${providerLabel} target shown above.`}
					</p>
				</div>
			</div>
		);
	} else {
		content = (
			<CurrentTargetDetails
				aniListEntryId={anilistId}
				effectiveMapping={effectiveMapping}
				linkedAniListEntries={mappingDetails?.linkedAniListEntries ?? []}
			/>
		);
	}

	return (
		<div className="flex w-full flex-col rounded-2xl bg-bg-secondary/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] md:min-h-full">
			<div className="flex shrink-0 items-center justify-between gap-3 pb-4">
				<p className="text-xs font-semibold leading-none text-text-primary">
					{headingLabel}
				</p>
				{activeTargetLink ? (
					<Button
						asChild
						variant="ghost"
						size="icon"
						tooltip={`Open in ${providerLabel}`}
						tooltipContainer={contentContainer ?? undefined}
						className="!h-[11px] !w-[11px] shrink-0 rounded-none! p-0! text-text-secondary hover:bg-transparent hover:text-accent-primary focus-visible:text-accent-primary"
					>
						<a
							href={activeTargetLink}
							target="_blank"
							rel="noreferrer"
							aria-label={`Open in ${providerLabel}`}
						>
							<ExternalLink className="h-[11px] w-[11px]" />
						</a>
					</Button>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col">{content}</div>
		</div>
	);
}
