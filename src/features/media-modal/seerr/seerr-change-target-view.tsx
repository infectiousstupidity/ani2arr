/** Seerr change-target modal view with search and manual target save state. */
// src/features/media-modal/seerr/seerr-change-target-view.tsx

import {
	useMemo,
	useState,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from "react";
import type { AniListId } from "@/anilist/types";
import type { GetSeerrMediaDetailsInput, SetManualSeerrTargetInput, SeerrRequestTarget } from "@/rpc/types";
import type {
	SeerrMediaDetails,
	SeerrSearchResult,
} from "@/providers/seerr/types";
import {
	useSeerrLinkedAniListEntries,
	useSeerrMediaDetails,
	useSeerrSearch,
	useSetManualSeerrTarget,
} from "@/queries/seerr";
import type { AniListHeaderData, MediaModalContainer } from "../types";
import { ModalShell } from "../chrome/modal-shell";
import { SeerrChangeTargetInfoPane } from "./seerr-change-target-info-pane";
import { SeerrChangeTargetMainPane } from "./seerr-change-target-main-pane";
import { SeerrFooter } from "./seerr-footer";
import {
	getDefaultSelectedSeasons,
	getSeerrDetailsSeasonKey,
	getSeerrTargetSeasonKey,
	getRequestableSeasonNumbers,
	toggleSeasonSelection,
	type SeerrSeasonDraft,
} from "./seerr-selection";

function currentTargetDefaultSeasons(input: {
	currentTarget: SeerrRequestTarget | null;
	selectedDetails: SeerrMediaDetails;
}): number[] {
	if (input.currentTarget?.mediaType !== "tv") return [];

	return getDefaultSelectedSeasons({
		mappedSeasons: input.currentTarget.seasons,
		tmdbMappedSeasons: input.currentTarget.tmdbSeasons,
		tvdbMappedSeasons: input.currentTarget.tvdbSeasons,
		seasons: input.selectedDetails.seasons,
	});
}

function getSelectedDetailsInput(
	selectedResult: SeerrSearchResult | null,
): GetSeerrMediaDetailsInput | null {
	if (selectedResult?.mediaType !== "tv") return null;
	return { mediaType: "tv", tmdbId: selectedResult.tmdbId };
}

function canSaveTvTarget(
	selectedResult: SeerrSearchResult | null,
	draftSeasons: readonly number[],
): boolean {
	return selectedResult?.mediaType === "tv" && draftSeasons.length > 0;
}

function buildTvManualTargetInput(input: {
	anilistId: AniListId;
	selectedDetails: SeerrMediaDetails | null;
	selectedResult: SeerrSearchResult | null;
	draftSeasons: readonly number[];
}): SetManualSeerrTargetInput | null {
	if (input.selectedResult?.mediaType !== "tv" || input.draftSeasons.length === 0) {
		return null;
	}

	return {
		anilistId: input.anilistId,
		mediaType: "tv",
		tmdbId: input.selectedResult.tmdbId,
		...(input.selectedDetails?.tvdbId === undefined
			? {}
			: { tvdbId: input.selectedDetails.tvdbId }),
		seasons: [...input.draftSeasons],
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return fallback;
}

export function SeerrChangeTargetView(props: {
	anilistId: AniListId;
	container: MediaModalContainer | undefined;
	contentContainer: HTMLDivElement | null;
	defaultQuery: string;
	format: AniListHeaderData["format"];
	header: ReactNode;
	isConfigured: boolean;
	onBackToRequest: () => void;
	onClose: () => void;
	selectedResult: SeerrSearchResult | null;
	setSelectedResult: Dispatch<SetStateAction<SeerrSearchResult | null>>;
	target: SeerrRequestTarget | null;
}): React.JSX.Element {
	const {
		anilistId,
		container,
		contentContainer,
		defaultQuery,
		format,
		header,
		isConfigured,
		onBackToRequest,
		onClose,
		selectedResult,
		setSelectedResult,
		target,
	} = props;
	const [searchQueryDraft, setSearchQueryDraft] = useState<string | null>(null);
	const [submittedQuery, setSubmittedQuery] = useState("");
	const [manualTargetSeasonDraft, setManualTargetSeasonDraft] =
		useState<SeerrSeasonDraft | null>(null);
	const search = useSeerrSearch({
		query: submittedQuery,
		enabled: isConfigured && submittedQuery.trim().length > 0,
	});
	const selectedDetailsQuery = useSeerrMediaDetails({
		input: getSelectedDetailsInput(selectedResult),
		enabled: isConfigured && selectedResult?.mediaType === "tv",
	});
	const selectedDetails = selectedDetailsQuery.data ?? null;
	const selectedLinkedEntriesQuery = useSeerrLinkedAniListEntries({
		input: selectedResult
			? { mediaType: selectedResult.mediaType, tmdbId: selectedResult.tmdbId }
			: null,
		enabled: isConfigured && selectedResult !== null,
	});
	const setManualTarget = useSetManualSeerrTarget();
	const selectedDetailsSeasonKey = useMemo(
		() => getSeerrDetailsSeasonKey(selectedDetails?.seasons),
		[selectedDetails?.seasons],
	);
	const targetSeasonKey = getSeerrTargetSeasonKey(target);
	const manualTargetSeasonKey =
		selectedResult?.mediaType === "tv"
			? `${selectedResult.tmdbId}:${selectedDetailsSeasonKey}:${targetSeasonKey}`
			: "";
	const defaultManualTargetSeasons = useMemo(() => {
		if (selectedResult?.mediaType !== "tv" || selectedDetails === null)
			return [];

		return currentTargetDefaultSeasons({
			currentTarget: target,
			selectedDetails,
		});
	}, [selectedDetails, selectedResult, target]);
	const draftSeasons =
		manualTargetSeasonDraft?.key === manualTargetSeasonKey
			? manualTargetSeasonDraft.seasons
			: defaultManualTargetSeasons;
	const searchQuery = searchQueryDraft ?? defaultQuery;
	const searchError = search.error
		? getErrorMessage(search.error, "Failed to search Seerr.")
		: null;
	const saveError = setManualTarget.error
		? getErrorMessage(setManualTarget.error, "Failed to save Seerr target.")
		: null;
	const saveTvTargetEnabled = canSaveTvTarget(selectedResult, draftSeasons);

	const handleSearch = (query: string): void => {
		const trimmed = query.trim();
		if (trimmed.length === 0) return;
		setSubmittedQuery(trimmed);
	};
	const saveMovieTarget = (result: SeerrSearchResult): void => {
		setManualTarget.mutate(
			{
				anilistId,
				mediaType: "movie",
				tmdbId: result.tmdbId,
			},
			{ onSuccess: onBackToRequest },
		);
	};
	const handleSelectResult = (result: SeerrSearchResult): void => {
		setSelectedResult(result);
		setManualTargetSeasonDraft(null);

		if (result.mediaType === "movie") {
			saveMovieTarget(result);
		}
	};
	const saveTvTarget = (): void => {
		const input = buildTvManualTargetInput({
			anilistId,
			selectedDetails,
			selectedResult,
			draftSeasons,
		});
		if (!input) return;

		setManualTarget.mutate(
			input,
			{ onSuccess: onBackToRequest },
		);
	};
	const handleEscapeKeyDown = (event: KeyboardEvent): void => {
		event.preventDefault();
		onBackToRequest();
	};

	return (
		<ModalShell
			contentContainer={contentContainer}
			header={header}
			leftPane={
				<SeerrChangeTargetMainPane
					defaultQuery={defaultQuery}
					currentTarget={target}
					format={format}
					isConfigured={isConfigured}
					selectedResult={selectedResult}
					searchQuery={searchQuery}
					setSearchQuery={setSearchQueryDraft}
					onSearch={handleSearch}
					searchResults={search.data ?? []}
					isSearching={search.isFetching}
					searchError={searchError}
					onSelectResult={handleSelectResult}
					contentContainer={contentContainer}
				/>
			}
			rightPane={
				<SeerrChangeTargetInfoPane
					anilistId={anilistId}
					selectedResult={selectedResult}
					selectedDetails={selectedDetails}
					draftSeasons={draftSeasons}
					linkedAniListEntries={selectedLinkedEntriesQuery.data ?? []}
					isSaving={setManualTarget.isPending}
					saveError={saveError}
					onToggleDraftSeason={(seasonNumber) =>
						setManualTargetSeasonDraft({
							key: manualTargetSeasonKey,
							seasons: toggleSeasonSelection(draftSeasons, seasonNumber),
						})
					}
					onSelectAllDraftSeasons={() =>
						setManualTargetSeasonDraft({
							key: manualTargetSeasonKey,
							seasons: getRequestableSeasonNumbers(selectedDetails?.seasons),
						})
					}
				/>
			}
			footer={
				<SeerrFooter
					view="change-target"
					isManualTarget={false}
					canSaveTvTarget={saveTvTargetEnabled}
					canRequest={false}
					isBusy={setManualTarget.isPending}
					isRequesting={false}
					requestLabel="Request selected"
					onClose={onClose}
					onChangeTarget={() => {}}
					onBackToRequest={onBackToRequest}
					onClearManualTarget={() => {}}
					onSaveTvTarget={saveTvTarget}
					onRequest={() => {}}
				/>
			}
			onOpenChange={(open) => !open && onClose()}
			onEscapeKeyDown={handleEscapeKeyDown}
			container={container}
		/>
	);
}
