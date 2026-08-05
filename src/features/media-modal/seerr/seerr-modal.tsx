/** Seerr modal shell selector and shared Seerr target data loading. */
// src/features/media-modal/seerr/seerr-modal.tsx

import { useState } from "react";
import type { AniListMediaFormat } from "@/anilist/types";
import type {
	SeerrMediaDetails,
	SeerrSearchResult,
} from "@/providers/seerr/types";
import {
	useSeerrMediaDetails,
	useSeerrPublicSettings,
	useSeerrTarget,
} from "@/queries/seerr";
import { getDirectAniListId, sourceFromInput } from "@/rpc/source-input";
import type { GetSeerrTargetInput, SeerrRequestTarget } from "@/rpc/types";
import { seerrMediaTypeFromAniListFormat } from "@/mapping/seerr-target";
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

function shouldLoadSeerrPublicSettings(input: {
	isConfigured: boolean;
	target: SeerrRequestTarget | null;
}): boolean {
	return input.isConfigured && input.target?.mediaType === "tv";
}

function isSeerrRequestDataLoading(input: {
	targetLoading: boolean;
	detailsLoading: boolean;
	publicSettingsLoading: boolean;
	target: SeerrRequestTarget | null;
}): boolean {
	if (input.targetLoading || input.detailsLoading) return true;
	return input.target?.mediaType === "tv" && input.publicSettingsLoading;
}

function addSeerrMediaType(
	input: Omit<GetSeerrTargetInput, "mediaType">,
	mediaType: "movie" | "tv" | null,
): GetSeerrTargetInput | null {
	return mediaType === null ? null : { ...input, mediaType };
}

function getSeerrMediaType(
	headerFormat: AniListMediaFormat | null | undefined,
	metadataFormat: AniListMediaFormat | null | undefined,
): "movie" | "tv" | null {
	return seerrMediaTypeFromAniListFormat(headerFormat ?? metadataFormat);
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
		source,
		...(anilistId === undefined ? {} : { anilistId }),
		fallbackLabel: `${source.source === "mal" ? "MAL" : "AniList"} #${source.id}`,
		metadataHint: metadataHint ?? null,
	});
	const isConfigured = base.options?.seerr.isConfigured === true;
	const mediaType = getSeerrMediaType(
		base.anilistHeaderData.format,
		base.resolvedMetadata?.format,
	);
	const targetQuery = useSeerrTarget(
		addSeerrMediaType(
			{
					...targetInput,
					title: base.providerRequestTitle,
					metadata: base.resolvedMetadata,
			},
			mediaType,
		),
		{ enabled: isConfigured },
	);
	const target = targetQuery.data ?? null;
	const detailsQuery = useSeerrMediaDetails({
		input: target
			? { mediaType: target.mediaType, tmdbId: target.tmdbId }
			: null,
		enabled: isConfigured && target !== null,
	});
	const publicSettingsQuery = useSeerrPublicSettings({
		enabled: shouldLoadSeerrPublicSettings({ isConfigured, target }),
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
			publicSettings={publicSettingsQuery.data ?? null}
			publicSettingsError={publicSettingsQuery.error ?? null}
			header={header}
			isConfigured={isConfigured}
			isLoading={isSeerrRequestDataLoading({
				targetLoading: targetQuery.isLoading,
				detailsLoading: detailsQuery.isLoading,
				publicSettingsLoading: publicSettingsQuery.isLoading,
				target,
			})}
			onChangeTarget={() => setView("change-target")}
			onClose={onClose}
			target={target}
		/>
	);
}
