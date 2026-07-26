/** Seerr request modal view with request mutation and modal-local scope state. */
// src/features/media-modal/seerr/seerr-request-view.tsx

import { useState, type ReactNode } from "react";
import type { AniListId } from "@/anilist/types";
import { toSeerrRequestInput } from "@/features/seerr-request/seerr-request-input";
import {
	getSeerrRequestScopeDecision,
	type SeerrRequestScope,
	type SeerrRequestScopeDecision,
} from "@/features/seerr-request/seerr-request-scope";
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
import { getUserErrorMessage } from "@/shared/errors/error-utils";
import type { ExtensionError } from "@/shared/errors/error.types";
import type { MediaModalContainer } from "../types";
import { ModalShell } from "../chrome/modal-shell";
import { SeerrFooter } from "./seerr-footer";
import { SeerrRequestInfoPane } from "./seerr-request-info-pane";
import { SeerrRequestMainPane } from "./seerr-request-main-pane";
import { getSeerrConnectionRecovery } from "./seerr-connection-recovery";
import { getMappedSeasonsForDetails } from "./seerr-selection";

type SeerrRequestScopeDraft = {
	key: string;
	scope: SeerrRequestScope;
};

const UNAVAILABLE_TV_SCOPE = {
	canChooseScope: false,
	canRequestWholeSeries: false,
	mappedSeasons: [],
	defaultScope: "all" as const,
} satisfies SeerrRequestScopeDecision;

type SeerrTvRequestState = {
	decision: SeerrRequestScopeDecision;
	key: string;
	selectedScope: SeerrRequestScope;
};

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
			? getUserErrorMessage(
					loadError,
					"Failed to load Seerr request details.",
				)
			: null,
		requestErrorMessage: input.requestError
			? getUserErrorMessage(input.requestError, "Failed to request in Seerr.")
			: null,
	};
}

function isTvScopeRequestable(
	scope: SeerrRequestScope,
	status: SeerrMediaStatus | undefined,
): boolean {
	if (status === undefined) return false;
	if (scope === "mapped") return isRequestableSeerrStatus(status);

	return !["available", "pending", "processing", "deleted-or-blocked"].includes(
		status,
	);
}

function getMappedScopeLabel(mappedSeasons: readonly number[]): string {
	return mappedSeasons.length === 1
		? `Request Season ${mappedSeasons[0]}`
		: "Request mapped seasons";
}

function getSeerrTvRequestState(input: {
	target: SeerrRequestTarget | null;
	details: SeerrMediaDetails | null;
	publicSettings: SeerrPublicSettings | null;
	draft: SeerrRequestScopeDraft | null;
}): SeerrTvRequestState {
	if (input.target?.mediaType !== "tv") {
		return { decision: UNAVAILABLE_TV_SCOPE, key: "", selectedScope: "all" };
	}

	const mappedSeasons = getMappedSeasonsForDetails({
		mappedSeasons: input.target.seasons,
		tmdbMappedSeasons: input.target.tmdbSeasons,
		tvdbMappedSeasons: input.target.tvdbSeasons,
		seasons: input.details?.seasons,
	});
	const decision =
		input.details === null || input.publicSettings === null
			? UNAVAILABLE_TV_SCOPE
			: getSeerrRequestScopeDecision({
					partialRequestsEnabled:
						input.publicSettings.partialRequestsEnabled,
					enableSpecialEpisodes: input.publicSettings.enableSpecialEpisodes,
					mappedSeasons,
					seasons: input.details.seasons ?? [],
				});
	const key = `${input.target.tmdbId}:${decision.mappedSeasons.join(",")}:${decision.canChooseScope}`;
	const draftApplies =
		input.draft?.key === key &&
		(input.draft.scope === "all" || decision.canChooseScope);

	return {
		decision,
		key,
		selectedScope: draftApplies
			? input.draft?.scope ?? decision.defaultScope
			: decision.defaultScope,
	};
}

function getRequestInput(
	target: SeerrRequestTarget | null,
	tvState: SeerrTvRequestState,
): RequestInSeerrInput | null {
	if (target?.mediaType !== "tv") return toSeerrRequestInput(target);

	const seasons =
		tvState.selectedScope === "mapped"
			? tvState.decision.mappedSeasons
			: "all";
	return toSeerrRequestInput(target, seasons);
}

function canRequestInSeerr(input: {
	isConfigured: boolean;
	needsConnectionRecovery: boolean;
	target: SeerrRequestTarget | null;
	tvState: SeerrTvRequestState;
	tvStatus: SeerrMediaStatus | undefined;
	isMovieRequestable: boolean;
}): boolean {
	if (!input.isConfigured || input.needsConnectionRecovery) return false;
	if (input.target?.mediaType !== "tv") return input.isMovieRequestable;

	const scopeAvailable =
		input.tvState.selectedScope === "mapped"
			? input.tvState.decision.canChooseScope
			: input.tvState.decision.canRequestWholeSeries;
	return (
		scopeAvailable &&
		isTvScopeRequestable(input.tvState.selectedScope, input.tvStatus)
	);
}

function getRequestLabel(
	target: SeerrRequestTarget | null,
	tvState: SeerrTvRequestState,
): string {
	if (target?.mediaType !== "tv") return "Request movie";
	if (tvState.selectedScope === "mapped") {
		return `${getMappedScopeLabel(tvState.decision.mappedSeasons)} in Seerr`;
	}
	return "Request whole series in Seerr";
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
	const [scopeDraft, setScopeDraft] =
		useState<SeerrRequestScopeDraft | null>(null);
	const request = useRequestInSeerr();
	const clearManualTarget = useClearManualSeerrTarget();
	const linkedEntriesQuery = useSeerrLinkedAniListEntries({
		input: target ? { mediaType: target.mediaType, tmdbId: target.tmdbId } : null,
		enabled: isConfigured && target !== null,
	});
	const tvState = getSeerrTvRequestState({
		target,
		details,
		publicSettings,
		draft: scopeDraft,
	});
	const requestInput = getRequestInput(target, tvState);
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
		tvState,
		tvStatus: statusQuery.data?.status,
		isMovieRequestable,
	});
	const mappedScopeLabel = getMappedScopeLabel(tvState.decision.mappedSeasons);
	const requestLabel = getRequestLabel(target, tvState);
	const isBusy = request.isPending || clearManualTarget.isPending;

	const handleRequest = (): void => {
		if (!isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		if (!requestInput) return;

		request.mutate(requestInput);
	};
	const handleScopeChange = (scope: SeerrRequestScope): void => {
		request.reset();
		setScopeDraft({ key: tvState.key, scope });
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
					isLoading={isRequestLoading}
					errorMessage={feedback.detailsErrorMessage}
					canChooseScope={tvState.decision.canChooseScope}
					mappedScopeLabel={mappedScopeLabel}
					selectedScope={tvState.selectedScope}
					requestError={feedback.requestErrorMessage}
					connectionActionLabel={feedback.connectionRecovery?.label ?? null}
					onConnectionAction={handleConnectionAction}
					onScopeChange={handleScopeChange}
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
