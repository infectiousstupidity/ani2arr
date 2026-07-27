/** Seerr request modal view with request mutation and season selection state. */
// src/features/media-modal/seerr/seerr-request-view.tsx

import { type ReactNode, useMemo, useState } from "react";
import type { AniListId } from "@/anilist/types";
import { toSeerrRequestInput } from "@/features/seerr-request/seerr-request-input";
import { isRequestableSeerrStatus } from "@/providers/seerr/request";
import type {
	SeerrMediaDetails,
	SeerrMediaStatus,
	SeerrPublicSettings,
} from "@/providers/seerr/types";
import {
	useClearManualSeerrTarget,
	useRequestInSeerr,
	useSeerrLinkedAniListEntries,
	useSeerrMediaStatus,
} from "@/queries/seerr";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type {
	RequestInSeerrInput,
	SeerrRequestTarget,
	SourceRpcInput,
} from "@/rpc/types";
import type { ExtensionError } from "@/shared/errors/error.types";
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import { ModalShell } from "../chrome/modal-shell";
import type { MediaModalContainer } from "../types";
import { getSeerrConnectionRecovery } from "./seerr-connection-recovery";
import { SeerrFooter } from "./seerr-footer";
import { SeerrRequestInfoPane } from "./seerr-request-info-pane";
import { SeerrRequestMainPane } from "./seerr-request-main-pane";
import {
	getDefaultSelectedSeasons,
	getRequestableSeasonNumbers,
	getSeerrDetailsSeasonKey,
	getSeerrTargetSeasonKey,
	isSelectableSeerrSeason,
	type SeerrSeasonDraft,
	toggleSeasonSelection,
} from "./seerr-selection";

function getSeerrRequestFeedback(input: {
	isConfigured: boolean;
	authMode: "session" | "apiKey" | null;
	detailsError: ExtensionError | null;
	publicSettingsError: ExtensionError | null;
	statusError: ExtensionError | null;
	requestError: ExtensionError | null;
}) {
	const loadError =
		input.detailsError ?? input.publicSettingsError ?? input.statusError;
	const connectionRecovery = getSeerrConnectionRecovery({
		isConfigured: input.isConfigured,
		authMode: input.authMode,
		errors: [
			input.detailsError,
			input.publicSettingsError,
			input.statusError,
			input.requestError,
		],
	});

	return {
		connectionRecovery,
		detailsErrorMessage: loadError
			? getUserErrorMessage(loadError, "Failed to load Seerr request details.")
			: null,
		requestErrorMessage: input.requestError
			? getUserErrorMessage(input.requestError, "Failed to request in Seerr.")
			: null,
	};
}

function isTvRequestableStatus(status: SeerrMediaStatus | undefined): boolean {
	if (status === undefined) return false;

	return !["available", "pending", "processing", "deleted-or-blocked"].includes(
		status,
	);
}

function getRequestInput(input: {
	target: SeerrRequestTarget | null;
	publicSettings: SeerrPublicSettings | null;
	selectedSeasons: readonly number[];
}): RequestInSeerrInput | null {
	if (input.target?.mediaType !== "tv") {
		return toSeerrRequestInput(input.target);
	}

	if (input.publicSettings === null) return null;

	if (!input.publicSettings.partialRequestsEnabled) {
		return toSeerrRequestInput(input.target, "all");
	}

	if (input.selectedSeasons.length === 0) return null;

	return toSeerrRequestInput(input.target, input.selectedSeasons);
}

function canRequestInSeerr(input: {
	isConfigured: boolean;
	needsConnectionRecovery: boolean;
	target: SeerrRequestTarget | null;
	requestInput: RequestInSeerrInput | null;
	tvStatus: SeerrMediaStatus | undefined;
	isMovieRequestable: boolean;
}): boolean {
	if (!input.isConfigured || input.needsConnectionRecovery) return false;

	if (input.target?.mediaType !== "tv") {
		return input.isMovieRequestable;
	}

	return input.requestInput !== null && isTvRequestableStatus(input.tvStatus);
}

function getRequestLabel(
	target: SeerrRequestTarget | null,
	publicSettings: SeerrPublicSettings | null,
): string {
	if (target?.mediaType === "movie") return "Request movie";
	if (target?.mediaType !== "tv") return "Request in Seerr";
	if (publicSettings === null) return "Request in Seerr";

	return publicSettings.partialRequestsEnabled
		? "Request selected in Seerr"
		: "Request whole series in Seerr";
}

function shouldLoadTvStatus(input: {
	isConfigured: boolean;
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	publicSettings: SeerrPublicSettings | null;
	requestInput: RequestInSeerrInput | null;
}): boolean {
	return (
		input.isConfigured &&
		input.target?.mediaType === "tv" &&
		input.details !== null &&
		input.publicSettings !== null &&
		input.requestInput !== null
	);
}

function isRequestDataLoading(input: {
	isLoading: boolean;
	statusEnabled: boolean;
	hasStatus: boolean;
	hasStatusError: boolean;
}): boolean {
	if (input.isLoading) return true;
	return input.statusEnabled && !input.hasStatus && !input.hasStatusError;
}

function getRequestSeasonSelection(input: {
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	publicSettings: SeerrPublicSettings | null;
	draft: SeerrSeasonDraft | null;
}): { key: string; seasons: number[] } {
	const detailsSeasonKey = getSeerrDetailsSeasonKey(input.details?.seasons);
	const targetSeasonKey = getSeerrTargetSeasonKey(input.target);
	const key =
		input.target?.mediaType === "tv"
			? [
					input.target.tmdbId,
					targetSeasonKey,
					detailsSeasonKey,
					input.publicSettings?.partialRequestsEnabled ?? "",
					input.publicSettings?.enableSpecialEpisodes ?? "",
				].join(":")
			: "";
	const defaultSeasons =
		input.target?.mediaType === "tv" &&
		input.details !== null &&
		input.publicSettings?.partialRequestsEnabled
			? getDefaultSelectedSeasons({
					mappedSeasons: input.target.seasons,
					tmdbMappedSeasons: input.target.tmdbSeasons,
					tvdbMappedSeasons: input.target.tvdbSeasons,
					seasons: input.details.seasons,
					enableSpecialEpisodes:
						input.publicSettings.enableSpecialEpisodes,
				})
			: [];

	return {
		key,
		seasons: input.draft?.key === key ? input.draft.seasons : defaultSeasons,
	};
}

export function SeerrRequestView(props: {
	targetInput: SourceRpcInput;
	anilistId?: AniListId | undefined;
	authMode: "session" | "apiKey" | null;
	container: MediaModalContainer | undefined;
	contentContainer: HTMLDivElement | null;
	details: SeerrMediaDetails | null;
	detailsError: ExtensionError | null;
	publicSettings: SeerrPublicSettings | null;
	publicSettingsError: ExtensionError | null;
	header: ReactNode;
	isConfigured: boolean;
	isLoading: boolean;
	onChangeTarget: () => void;
	onClose: () => void;
	target: SeerrRequestTarget | null;
}): React.JSX.Element {
	const {
		targetInput,
		anilistId,
		authMode,
		container,
		contentContainer,
		details,
		detailsError,
		publicSettings,
		publicSettingsError,
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
		input: target
			? { mediaType: target.mediaType, tmdbId: target.tmdbId }
			: null,
		enabled: isConfigured && target !== null,
	});
	const { key: selectedSeasonKey, seasons: selectedSeasons } = useMemo(
		() =>
			getRequestSeasonSelection({
				target,
				details,
				publicSettings,
				draft: selectedSeasonDraft,
			}),
		[details, publicSettings, selectedSeasonDraft, target],
	);
	const requestInput = getRequestInput({
		target,
		publicSettings,
		selectedSeasons,
	});
	const statusEnabled = shouldLoadTvStatus({
		isConfigured,
		target,
		details,
		publicSettings,
		requestInput,
	});
	const statusQuery = useSeerrMediaStatus({
		requestInput,
		enabled: statusEnabled,
	});
	const isRequestLoading = isRequestDataLoading({
		isLoading,
		statusEnabled,
		hasStatus: statusQuery.data !== undefined,
		hasStatusError: statusQuery.isError,
	});
	const feedback = getSeerrRequestFeedback({
		isConfigured,
		authMode,
		detailsError,
		publicSettingsError,
		statusError: statusQuery.error,
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
		requestInput,
		tvStatus: statusQuery.data?.target,
		isMovieRequestable,
	});
	const requestLabel = getRequestLabel(target, publicSettings);
	const isBusy = request.isPending || clearManualTarget.isPending;

	const handleRequest = (): void => {
		if (!isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		if (!requestInput) return;

		request.mutate(requestInput);
	};

	const handleSelectAllRequestable = (): void => {
		request.reset();
		setSelectedSeasonDraft({
			key: selectedSeasonKey,
			seasons: getRequestableSeasonNumbers(
				details?.seasons,
				publicSettings?.enableSpecialEpisodes,
			),
		});
	};

	const handleToggleSeason = (seasonNumber: number): void => {
		const season = details?.seasons?.find(
			(candidate) => candidate.seasonNumber === seasonNumber,
		);
		if (!season || !isSelectableSeerrSeason(season)) return;
		if (seasonNumber === 0 && publicSettings?.enableSpecialEpisodes !== true) {
			return;
		}

		request.reset();
		setSelectedSeasonDraft({
			key: selectedSeasonKey,
			seasons: toggleSeasonSelection(selectedSeasons, seasonNumber),
		});
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
					isLoading={isRequestLoading}
					errorMessage={feedback.detailsErrorMessage}
					partialRequestsEnabled={
						publicSettings?.partialRequestsEnabled === true
					}
					enableSpecialEpisodes={publicSettings?.enableSpecialEpisodes === true}
					selectedSeasons={selectedSeasons}
					requestError={feedback.requestErrorMessage}
					connectionActionLabel={feedback.connectionRecovery?.label ?? null}
					onConnectionAction={handleConnectionAction}
					onSelectAllRequestable={handleSelectAllRequestable}
					onToggleSeason={handleToggleSeason}
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
					onClearManualTarget={() => clearManualTarget.mutate(targetInput)}
					onRequest={handleRequest}
				/>
			}
			onOpenChange={(open) => !open && onClose()}
			container={container}
		/>
	);
}
