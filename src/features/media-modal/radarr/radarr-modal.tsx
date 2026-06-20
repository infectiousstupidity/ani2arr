/** Concrete Radarr media modal composition and direct data flow. */
// src/features/media-modal/radarr/radarr-modal.tsx

import { useMemo, useState } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import type { TmdbId } from "@/providers/schemas";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import {
	useMappingInspection,
} from "@/queries/mapping";
import { useMovieStatus, useRadarrFormResources } from "@/queries/radarr";
import type { GetMovieStatusOutput } from "@/rpc/types";
import { createDefaultRadarrFormState as defaultRadarrFormState } from "@/providers/radarr/form-state";
import { DetailsPanel } from "../details/details-panel";
import { useContentPortalContainer } from "../hooks/use-content-portal-container";
import { useMappingActions } from "../hooks/use-mapping-actions";
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import { useOpenMappingSettingsAction } from "../hooks/use-open-mapping-settings-action";
import {
	getOverwriteTargetTitle,
	pickProviderPoster,
	targetsEqual,
} from "../helpers";
import {
	MappingFooter,
	MediaModalFooterTransition,
	SetupFooter,
} from "../chrome/modal-footer";
import { ModalHeader } from "../chrome/modal-header";
import { ModalShell } from "../chrome/modal-shell";
import {
	RadarrMappingPanel,
	type RadarrMappingCandidate,
} from "./radarr-mapping-panel";
import { useRadarrSetupForm } from "./radarr-setup-form";
import {
	canShowRadarrSetup,
	getRadarrSetupTarget,
} from "./radarr-setup-values";
import type {
	AniListHeaderData,
	MediaModalMetadataHint,
	MediaModalTargetSummary,
	MediaModalView,
	RadarrModalProps,
} from "../types";

const PROVIDER = "radarr" as const;
const SETUP_FORM_ID = "radarr-setup-form";

type RadarrModalData = {
	isConfigured: boolean;
	anilistHeaderData: AniListHeaderData;
	manualMappingActive: boolean;
	currentTarget: MediaModalTargetSummary | null;
	resolvedMetadata: AniListMediaHint | null;
	providerRequestTitle: string;
	providerPayloadTitle: string | undefined;
	fallbackLookupTitle: string | undefined;
	rawProviderStatus: GetMovieStatusOutput | null;
	verificationSettled: boolean;
	verificationFailed: boolean;
	storedDefaults: ReturnType<typeof defaultRadarrFormState>;
	providerFormResources: ProviderFormResources | null;
};

function getRejectCandidateTmdbId(input: {
	inspection: ReturnType<typeof useMappingInspection>["data"];
	manualMappingActive: boolean;
}): TmdbId | null {
	if (input.manualMappingActive) return null;

	const mapping = input.inspection?.mapping;
	if (mapping?.kind === "mapped" && mapping.source === "auto") {
		return parseTmdbIdOrNull(mapping.providerId);
	}

	return null;
}

function shouldShowMappingView(input: {
	view: MediaModalView;
	verificationSettled: boolean;
	canShowSetup: boolean;
}): boolean {
	if (input.view === "mapping") return true;

	return input.verificationSettled && !input.canShowSetup;
}

function isSetupTargetLoading(input: {
	view: MediaModalView;
	isMappingView: boolean;
	isConfigured: boolean;
	hasSetupTarget: boolean;
	verificationSettled: boolean;
}): boolean {
	return (
		input.view === "setup" &&
		!input.isMappingView &&
		input.isConfigured &&
		!input.hasSetupTarget &&
		!input.verificationSettled
	);
}

function getCurrentTarget(input: {
	status: GetMovieStatusOutput | null;
}): MediaModalTargetSummary | null {
	const { status } = input;
	const movie = status?.movie;
	const tmdbId = parseTmdbIdOrNull(
		status?.mapping.kind === "mapped" ? status.mapping.providerId : undefined,
	);
	if (!movie || tmdbId === null) return null;

	const providerRouteSlug = getProviderRouteSlug(PROVIDER, movie) ?? undefined;
	const posterUrl = pickProviderPoster(movie);

	return {
		provider: PROVIDER,
		providerId: tmdbId,
		title: movie.title,
		isInLibrary: status.isInLibrary === true,
		typeLabel: "Movie",
		...(movie.folderName ? { providerFolderName: movie.folderName } : {}),
		...(movie.year === undefined ? {} : { year: movie.year }),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl ? { posterUrl } : {}),
		...(movie.status ? { statusLabel: movie.status } : {}),
		...("overview" in movie && movie.overview
			? { overview: movie.overview }
			: {}),
		...("runtime" in movie && movie.runtime !== undefined
			? { runtimeMinutes: movie.runtime }
			: {}),
		...(movie.hasFile === undefined ? {} : { hasFile: movie.hasFile }),
	};
}

function useRadarrModalData(input: {
	anilistId: AniListId;
	metadataHint: MediaModalMetadataHint | null;
}): RadarrModalData {
	const { anilistId, metadataHint } = input;
	const base = useMediaModalBaseData({ anilistId, metadataHint });
	const options = base.options;
	const isConfigured = options?.providers.radarr.isConfigured === true;
	const radarrFormResources = useRadarrFormResources({ enabled: isConfigured });

	const statusPayload = useMemo(
		() => ({
			anilistId,
			...(base.statusTitle === undefined ? {} : { title: base.statusTitle }),
			metadata: base.statusMetadata,
		}),
		[anilistId, base.statusMetadata, base.statusTitle],
	);
	const radarrStatus = useMovieStatus(statusPayload, {
		enabled: isConfigured && base.statusReady,
		force_verify: true,
	});
	const verificationSettled =
		radarrStatus.isFetchedAfterMount || radarrStatus.isError;
	const rawProviderStatus = radarrStatus.data ?? null;
	const verificationFailed =
		verificationSettled &&
		(radarrStatus.isError || rawProviderStatus?.isInLibrary === null);
	const currentTarget = getCurrentTarget({
		status: rawProviderStatus,
	});
	const manualMappingActive =
		rawProviderStatus?.mapping.kind === "mapped" &&
		rawProviderStatus.mapping.source === "manual";

	return {
		isConfigured,
		anilistHeaderData: base.anilistHeaderData,
		manualMappingActive,
		currentTarget,
		resolvedMetadata: base.resolvedMetadata,
		providerRequestTitle: base.providerRequestTitle,
		providerPayloadTitle: base.providerPayloadTitle,
		fallbackLookupTitle: base.fallbackLookupTitle,
		rawProviderStatus,
		verificationSettled,
		verificationFailed,
		storedDefaults:
			options?.providers.radarr.defaults ?? defaultRadarrFormState(),
		providerFormResources: radarrFormResources.data ?? null,
	};
}

export function RadarrModal({
	state,
	onClose,
	container,
}: RadarrModalProps): React.JSX.Element {
	const { anilistId, source, metadataHint, openSource, initialView } = state;
	const [view, setView] = useState<MediaModalView>(initialView ?? "setup");
	const [selectedCandidate, setSelectedCandidate] =
		useState<RadarrMappingCandidate | null>(null);
	const contentContainer = useContentPortalContainer();
	const data = useRadarrModalData({
		anilistId,
		metadataHint: metadataHint ?? null,
	});
	const inspection = useMappingInspection(PROVIDER, anilistId);
	const setupTarget = useMemo(
		() =>
			getRadarrSetupTarget({
				anilistId,
				status: data.rawProviderStatus,
				targetTitle: data.providerRequestTitle,
				storedDefaults: data.storedDefaults,
			}),
		[
			anilistId,
			data.providerRequestTitle,
			data.rawProviderStatus,
			data.storedDefaults,
		],
	);
	const canShowSetup = canShowRadarrSetup({
		isConfigured: data.isConfigured,
		status: data.rawProviderStatus,
	});
	const isMappingView = shouldShowMappingView({
		view,
		verificationSettled: data.verificationSettled,
		canShowSetup,
	});
	const setupTargetLoading = isSetupTargetLoading({
		view,
		isMappingView,
		isConfigured: data.isConfigured,
		hasSetupTarget: setupTarget !== null,
		verificationSettled: data.verificationSettled,
	});
	const setupForm = useRadarrSetupForm({
		formId: SETUP_FORM_ID,
		anilistId,
		target: setupTarget,
		providerPayloadTitle: data.providerPayloadTitle,
		fallbackLookupTitle: data.fallbackLookupTitle,
		resolvedMetadata: data.resolvedMetadata,
		isConfigured: data.isConfigured,
		formResources: data.providerFormResources,
		portalContainer: contentContainer,
		targetLoading: setupTargetLoading,
		verificationFailed: data.verificationFailed,
		verificationSettled: data.verificationSettled,
		onClose,
	});
	const previewTarget = isMappingView ? (selectedCandidate?.summary ?? null) : null;
	const handleOpenSettings = useOpenMappingSettingsAction({
		anilistId,
		openSource,
	});
	const rejectCandidateTmdbId = getRejectCandidateTmdbId({
		inspection: inspection.data,
		manualMappingActive: data.manualMappingActive,
	});
	const clearRejectedCandidateTmdbId = parseTmdbIdOrNull(
		inspection.data?.mapping.kind === "unmapped"
			? inspection.data.mapping.rejectedProviderIds?.[0]
			: undefined,
	);
	const canIgnoreTitle = inspection.data?.mapping.kind !== "ignored";
	const canSubmitMapping =
		selectedCandidate !== null &&
		!targetsEqual(selectedCandidate.summary, data.currentTarget);
	const overwriteTargetTitle = getOverwriteTargetTitle(
		previewTarget,
		data.currentTarget,
	);
	const showSetupView = (): void => {
		setSelectedCandidate(null);
		setView("setup");
	};
	const mappingActions = useMappingActions({
		anilistId,
		source,
		provider: PROVIDER,
		selectedProviderId: selectedCandidate?.tmdbId ?? null,
		rejectProviderId: rejectCandidateTmdbId,
		clearRejectedProviderId: clearRejectedCandidateTmdbId,
		requiresApplyConfirmation: setupForm.footerState.isDirty && canSubmitMapping,
		onMappingApplied: () => { setSelectedCandidate(null); showSetupView(); },
		onMappingReset: () => { setSelectedCandidate(null); setView("mapping"); },
		onIgnored: onClose,
	});
	const showMappingView = (): void => setView("mapping");
	const handleEscapeKeyDown = (event: KeyboardEvent): void => {
		if (!isMappingView || !canShowSetup) return;

		event.preventDefault();
		showSetupView();
	};

	return (
		<ModalShell
			contentContainer={contentContainer}
			header={
				<ModalHeader
					provider={PROVIDER}
					contentContainer={contentContainer}
					anilistHeaderData={data.anilistHeaderData}
					anilistId={anilistId}
					isMappingView={isMappingView}
					isProviderTargetLoading={setupTargetLoading}
					currentTarget={data.currentTarget}
					previewTarget={previewTarget}
					onClose={onClose}
					onOpenSettings={handleOpenSettings ?? undefined}
				/>
			}
			leftPane={
				isMappingView ? (
					<RadarrMappingPanel
						contentContainer={contentContainer}
						currentTarget={data.currentTarget}
						selectedCandidate={selectedCandidate}
						onSelectCandidate={setSelectedCandidate}
					/>
				) : (
					setupForm.content
				)
			}
			rightPane={
				<DetailsPanel
					provider={PROVIDER}
					contentContainer={contentContainer}
					anilistId={anilistId}
					effectiveMapping={data.currentTarget}
					previewMapping={previewTarget}
					isInMappingMode={isMappingView}
					mappingDetails={inspection.data}
				/>
			}
			footer={
				<MediaModalFooterTransition
					modeKey={isMappingView ? "mapping" : "setup"}
				>
					{isMappingView ? (
						<MappingFooter
							manualMappingActive={data.manualMappingActive}
							isResettingMapping={mappingActions.isRevertingMapping}
							canRejectCandidate={rejectCandidateTmdbId !== null}
							canClearRejectedCandidate={clearRejectedCandidateTmdbId !== null}
							canIgnoreTitle={canIgnoreTitle}
							isRejectingCandidate={mappingActions.isRejectingCandidate}
							isClearingRejectedCandidate={mappingActions.isClearingRejectedCandidate}
							isIgnoring={mappingActions.isIgnoring}
							canApplyMapping={canSubmitMapping}
							isApplyingMapping={mappingActions.isSubmittingMapping}
							leaveMappingLabel={canShowSetup ? "Back to setup" : "Exit modal"}
							overwriteTargetTitle={overwriteTargetTitle}
							actionError={mappingActions.actionError}
							onRejectCandidate={mappingActions.rejectCandidate}
							onClearRejectedCandidate={mappingActions.clearRejectedCandidate}
							onIgnoreTitle={mappingActions.ignoreTitle}
							onLeaveMapping={canShowSetup ? showSetupView : onClose}
							onResetMapping={mappingActions.resetMapping}
							onApplyMapping={mappingActions.applyMapping}
						/>
					) : (
						<SetupFooter
							formId={SETUP_FORM_ID}
							canSubmit={setupForm.footerState.canSubmit}
							isBusy={setupForm.footerState.isBusy}
							isSubmitting={setupForm.footerState.isSubmitting}
							submitLabel={setupForm.footerState.submitLabel}
							actionError={setupForm.footerState.actionError}
							onCancel={onClose}
							onOpenMapping={showMappingView}
						/>
					)}
				</MediaModalFooterTransition>
			}
			onOpenChange={(open) => !open && onClose()}
			onEscapeKeyDown={handleEscapeKeyDown}
			container={container}
		/>
	);
}
