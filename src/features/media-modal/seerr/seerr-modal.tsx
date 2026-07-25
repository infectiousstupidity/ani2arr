/** Seerr modal shell selector and shared Seerr target data loading. */
// src/features/media-modal/seerr/seerr-modal.tsx

import { useState } from "react";
import type { SeerrMediaDetails, SeerrSearchResult } from "@/providers/seerr/types";
import { useSeerrMediaDetails, useSeerrTarget } from "@/queries/seerr";
import type { SeerrRequestTarget } from "@/rpc/types";
import { getDirectAniListId, sourceFromInput } from "@/rpc/source-input";
import type { MappingConnectorState } from "../chrome/mapping-connector";
import { useContentPortalContainer } from "../hooks/use-content-portal-container";
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import type { SeerrModalProps } from "../types";
import { SeerrChangeTargetView } from "./seerr-change-target-view";
import { SeerrHeader } from "./seerr-header";
import { SeerrRequestView } from "./seerr-request-view";

type SeerrView = "request" | "change-target";

function getConnectorState(input: {
	view: SeerrView;
	selectedResult: SeerrSearchResult | null;
}): MappingConnectorState {
	if (input.view === "request") return "setup";
	return input.selectedResult ? "selected" : "search";
}

function getTargetTitle(input: {
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
}): string {
	if (input.details) return input.details.title;
	if (!input.target) return "No Seerr target";
	return `${input.target.mediaType === "movie" ? "Movie" : "TV"} TMDB ID: ${input.target.tmdbId}`;
}

export function SeerrModal({
	state,
	onClose,
	container,
}: SeerrModalProps): React.JSX.Element {
	const { metadataHint } = state;
	const source = sourceFromInput(state);
	const anilistId = getDirectAniListId(state) ?? undefined;
	const targetInput = {
		source,
		...(anilistId === undefined ? {} : { anilistId }),
	};
	const [view, setView] = useState<SeerrView>("request");
	const [selectedResult, setSelectedResult] =
		useState<SeerrSearchResult | null>(null);
	const contentContainer = useContentPortalContainer();
	const base = useMediaModalBaseData({
		...(anilistId === undefined ? {} : { anilistId }),
		fallbackLabel: `${source.source === "mal" ? "MAL" : "AniList"} #${source.id}`,
		metadataHint: metadataHint ?? null,
	});
	const isConfigured = base.options?.seerr.isConfigured === true;
	const targetQuery = useSeerrTarget(targetInput, { enabled: isConfigured });
	const target = targetQuery.data ?? null;
	const detailsQuery = useSeerrMediaDetails({
		input: target ? { mediaType: target.mediaType, tmdbId: target.tmdbId } : null,
		enabled: isConfigured && target !== null,
	});
	const details = detailsQuery.data ?? null;
	const targetTitle = getTargetTitle({ target, details });
	const header = (
		<SeerrHeader
			source={source}
			data={base.anilistHeaderData}
			target={target}
			details={details}
			targetTitle={targetTitle}
			isLoadingTarget={targetQuery.isLoading}
			connectorState={getConnectorState({ view, selectedResult })}
			onClose={onClose}
			contentContainer={contentContainer}
		/>
	);

	if (view === "change-target") {
		return (
			<SeerrChangeTargetView
				targetInput={targetInput}
				{...(anilistId === undefined ? {} : { anilistId })}
				container={container}
				contentContainer={contentContainer}
				defaultQuery={base.providerRequestTitle}
				format={base.anilistHeaderData.format}
				header={header}
				isConfigured={isConfigured}
				onBackToRequest={() => setView("request")}
				onClose={onClose}
				selectedResult={selectedResult}
				setSelectedResult={setSelectedResult}
				target={target}
			/>
		);
	}

	return (
		<SeerrRequestView
			targetInput={targetInput}
			{...(anilistId === undefined ? {} : { anilistId })}
			authMode={base.options?.seerr.authMode ?? null}
			container={container}
			contentContainer={contentContainer}
			details={details}
			detailsError={detailsQuery.error ?? null}
			header={header}
			isConfigured={isConfigured}
			isLoading={targetQuery.isLoading || detailsQuery.isLoading}
			onChangeTarget={() => setView("change-target")}
			onClose={onClose}
			target={target}
		/>
	);
}
