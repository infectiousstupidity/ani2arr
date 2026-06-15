/** Seerr request modal view with request mutation and season selection state. */
// src/features/media-modal/seerr/seerr-request-view.tsx

import { useMemo, useState, type ReactNode } from "react";
import type { AniListId } from "@/anilist/types";
import { isRequestableSeerrStatus } from "@/providers/seerr/request";
import type { SeerrMediaDetails } from "@/providers/seerr/types";
import {
	useClearManualSeerrTarget,
	useRequestInSeerr,
	useSeerrLinkedAniListEntries,
} from "@/queries/seerr";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { RequestInSeerrInput, SeerrRequestTarget } from "@/rpc/types";
import type { MediaModalContainer } from "../types";
import { ModalShell } from "../chrome/modal-shell";
import { SeerrFooter } from "./seerr-footer";
import { SeerrRequestInfoPane } from "./seerr-request-info-pane";
import { SeerrRequestMainPane } from "./seerr-request-main-pane";
import {
	getDefaultSelectedSeasons,
	getSeerrDetailsSeasonKey,
	getSeerrTargetSeasonKey,
	getRequestableSeasonNumbers,
	toggleSeasonSelection,
	type SeerrSeasonDraft,
} from "./seerr-selection";

function buildRequestInput(input: {
	anilistId: AniListId;
	target: SeerrRequestTarget | null;
	selectedSeasons: readonly number[];
}): RequestInSeerrInput | null {
	if (!input.target) return null;
	if (input.target.mediaType === "movie") {
		return {
			anilistId: input.anilistId,
			mediaType: "movie",
			tmdbId: input.target.tmdbId,
		};
	}

	if (input.selectedSeasons.length === 0) return null;
	return {
		anilistId: input.anilistId,
		mediaType: "tv",
		tmdbId: input.target.tmdbId,
		...(input.target.tvdbId === undefined ? {} : { tvdbId: input.target.tvdbId }),
		seasons: [...input.selectedSeasons],
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	return fallback;
}

export function SeerrRequestView(props: {
	anilistId: AniListId;
	container: MediaModalContainer | undefined;
	contentContainer: HTMLDivElement | null;
	details: SeerrMediaDetails | null;
	detailsError: string | null;
	header: ReactNode;
	isConfigured: boolean;
	isLoading: boolean;
	onChangeTarget: () => void;
	onClose: () => void;
	target: SeerrRequestTarget | null;
}): React.JSX.Element {
	const {
		anilistId,
		container,
		contentContainer,
		details,
		detailsError,
		header,
		isConfigured,
		isLoading,
		onChangeTarget,
		onClose,
		target,
	} = props;
	const [selectedSeasonDraft, setSelectedSeasonDraft] =
		useState<SeerrSeasonDraft | null>(null);
	const request = useRequestInSeerr();
	const clearManualTarget = useClearManualSeerrTarget();
	const linkedEntriesQuery = useSeerrLinkedAniListEntries({
		input: target ? { mediaType: target.mediaType, tmdbId: target.tmdbId } : null,
		enabled: isConfigured && target !== null,
	});
	const detailsSeasonKey = useMemo(
		() => getSeerrDetailsSeasonKey(details?.seasons),
		[details?.seasons],
	);
	const targetSeasonKey = getSeerrTargetSeasonKey(target);
	const selectedSeasonKey =
		target?.mediaType === "tv"
			? `${target.tmdbId}:${targetSeasonKey}:${detailsSeasonKey}`
			: "";
	const defaultSelectedSeasons = useMemo(() => {
		if (target?.mediaType !== "tv" || details === null) return [];

		return getDefaultSelectedSeasons({
			mappedSeasons: target.seasons,
			tmdbMappedSeasons: target.tmdbSeasons,
			tvdbMappedSeasons: target.tvdbSeasons,
			seasons: details.seasons,
		});
	}, [details, target]);
	const selectedSeasons =
		selectedSeasonDraft?.key === selectedSeasonKey
			? selectedSeasonDraft.seasons
			: defaultSelectedSeasons;
	const requestError = request.error
		? getErrorMessage(request.error, "Failed to request in Seerr.")
		: null;
	const isMovieRequestable =
		target?.mediaType === "movie" &&
		details !== null &&
		isRequestableSeerrStatus(details.status);
	const canRequest =
		isConfigured &&
		(target?.mediaType === "tv"
			? selectedSeasons.length > 0
			: isMovieRequestable);
	const requestLabel =
		target?.mediaType === "tv" ? "Request selected" : "Request movie";
	const isBusy = request.isPending || clearManualTarget.isPending;

	const handleRequest = (): void => {
		if (!isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		const requestInput = buildRequestInput({
			anilistId,
			target,
			selectedSeasons,
		});
		if (!requestInput) return;

		request.mutate(requestInput);
	};

	return (
		<ModalShell
			contentContainer={contentContainer}
			header={header}
			leftPane={
				<SeerrRequestMainPane
					target={target}
					details={details}
					isLoading={isLoading}
					errorMessage={detailsError}
					selectedSeasons={selectedSeasons}
					isConfigured={isConfigured}
					requestError={requestError}
					onSelectAllRequestable={() =>
						setSelectedSeasonDraft({
							key: selectedSeasonKey,
							seasons: getRequestableSeasonNumbers(details?.seasons),
						})
					}
					onToggleSeason={(seasonNumber) =>
						setSelectedSeasonDraft({
							key: selectedSeasonKey,
							seasons: toggleSeasonSelection(selectedSeasons, seasonNumber),
						})
					}
				/>
			}
			rightPane={
				<SeerrRequestInfoPane
					anilistId={anilistId}
					target={target}
					details={details}
					linkedAniListEntries={linkedEntriesQuery.data ?? []}
					isLoading={isLoading}
				/>
			}
			footer={
				<SeerrFooter
					view="request"
					isManualTarget={target?.source === "manual"}
					canSaveTvTarget={false}
					canRequest={canRequest}
					isBusy={isBusy}
					isRequesting={request.isPending}
					requestLabel={requestLabel}
					onClose={onClose}
					onChangeTarget={onChangeTarget}
					onBackToRequest={() => {}}
					onClearManualTarget={() => clearManualTarget.mutate(anilistId)}
					onSaveTvTarget={() => {}}
					onRequest={handleRequest}
				/>
			}
			onOpenChange={(open) => !open && onClose()}
			container={container}
		/>
	);
}
