/** Read-only right-side details panel for media modal flows. */
// src/features/media-modal/details/details-panel.tsx

import type { AniListId } from "@/anilist";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { Provider } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
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
	onClearPreview: () => void;
};

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
		onClearPreview,
	} = props;
	const providerLabel = getProviderLabel(provider);
	const headingLabel = isInMappingMode
		? `PREVIEWING ${providerLabel.toUpperCase()} MATCH`
		: "CURRENT TARGET DETAILS";
	let content: React.JSX.Element;

	if (isInMappingMode) {
		content = previewMapping ? (
			<PreviewTargetDetails
				aniListEntryId={anilistId}
				previewMapping={previewMapping}
				onResetPreview={onClearPreview}
				baseUrl={baseUrl}
				contentContainer={contentContainer}
			/>
		) : (
			<div className="flex min-h-65 flex-1 items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 px-3 text-center text-sm text-text-secondary">
				{`Select a search result to preview how it would replace the current ${providerLabel} target shown above.`}
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
		<div className="flex h-full min-h-0 flex-col rounded-2xl bg-bg-secondary/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
			<div className="flex shrink-0 items-end justify-between gap-3 pb-4">
				<p className="text-[11px] font-semibold leading-none tracking-[0.16em] text-text-secondary uppercase">
					{headingLabel}
				</p>
			</div>

			<div className="min-h-0 flex-1">{content}</div>
		</div>
	);
}
