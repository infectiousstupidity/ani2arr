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
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import type { ExtensionError } from "@/shared/errors/error.types";
import type { MediaModalContainer } from "../types";
import { ModalShell } from "../chrome/modal-shell";
import { SeerrFooter } from "./seerr-footer";
import { SeerrRequestInfoPane } from "./seerr-request-info-pane";
import { SeerrRequestMainPane } from "./seerr-request-main-pane";
import { getSeerrConnectionRecovery } from "./seerr-connection-recovery";
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

function getSeerrRequestFeedback(input: {
	isConfigured: boolean;
	authMode: "session" | "apiKey" | null;
	detailsError: ExtensionError | null;
	requestError: ExtensionError | null;
}) {
	const connectionRecovery = getSeerrConnectionRecovery({
		isConfigured: input.isConfigured,
		authMode: input.authMode,
		errors: [input.detailsError, input.requestError],
	});

	return {
		connectionRecovery,
		detailsErrorMessage: input.detailsError
			? getUserErrorMessage(
					input.detailsError,
					"Failed to load Seerr media details.",
				)
			: null,
		requestErrorMessage: input.requestError
			? getUserErrorMessage(input.requestError, "Failed to request in Seerr.")
			: null,
	};
}

function canRequestInSeerr(input: {
	isConfigured: boolean;
	needsConnectionRecovery: boolean;
	target: SeerrRequestTarget | null;
	selectedSeasons: readonly number[];
	isMovieRequestable: boolean;
}): boolean {
	if (!input.isConfigured || input.needsConnectionRecovery) return false;
	return input.target?.mediaType === "tv"
		? input.selectedSeasons.length > 0
		: input.isMovieRequestable;
}

export function SeerrRequestView(props: {
	anilistId: AniListId;
	authMode: "session" | "apiKey" | null;
	container: MediaModalContainer | undefined;
	contentContainer: HTMLDivElement | null;
	details: SeerrMediaDetails | null;
	detailsError: ExtensionError | null;
	header: ReactNode;
	isConfigured: boolean;
	isLoading: boolean;
	onChangeTarget: () => void;
	onClose: () => void;
	target: SeerrRequestTarget | null;
}): React.JSX.Element {
	const {
		anilistId,
		authMode,
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
	const feedback = getSeerrRequestFeedback({
		isConfigured,
		authMode,
		detailsError,
		requestError: request.error,
	});
	const isMovieRequestable =
		target?.mediaType === "movie" &&
		details !== null &&
		isRequestableSeerrStatus(details.status);
	const canRequest = canRequestInSeerr({
		isConfigured,
		needsConnectionRecovery: feedback.connectionRecovery !== null,
		target,
		selectedSeasons,
		isMovieRequestable,
	});
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

	const handleConnectionAction = (): void => {
		if (feedback.connectionRecovery?.enableCsrf) {
			request.reset();
			openOptionsPage({
				sectionId: "seerr",
				enableSeerrCsrf: true,
			});
			return;
		}

		openOptionsPage({ sectionId: "seerr" });
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
					errorMessage={feedback.detailsErrorMessage}
					selectedSeasons={selectedSeasons}
					requestError={feedback.requestErrorMessage}
					connectionActionLabel={feedback.connectionRecovery?.label ?? null}
					onConnectionAction={handleConnectionAction}
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
					canRequest={canRequest}
					isBusy={isBusy}
					isRequesting={request.isPending}
					requestLabel={requestLabel}
					onClose={onClose}
					onChangeTarget={onChangeTarget}
					onClearManualTarget={() => clearManualTarget.mutate(anilistId)}
					onRequest={handleRequest}
				/>
			}
			onOpenChange={(open) => !open && onClose()}
			container={container}
		/>
	);
}
