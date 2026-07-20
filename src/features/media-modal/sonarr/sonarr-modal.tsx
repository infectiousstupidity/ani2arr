/** Concrete Sonarr media modal composition and direct data flow. */
// src/features/media-modal/sonarr/sonarr-modal.tsx

import { useMemo, useState } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import { parseTvdbIdOrNull } from "@/providers/schemas";
import type { ProviderFormResources } from "@/providers/types";
import type { TvdbId } from "@/providers/schemas";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import {
	mappingInspectionInput,
	useMappingInspection,
} from "@/queries/mapping";
import { useSeriesStatus, useSonarrFormResources } from "@/queries/sonarr";
import { createDefaultSonarrFormState as defaultSonarrFormState } from "@/providers/sonarr/form-state";
import type { GetSeriesStatusOutput } from "@/rpc/types";
import { DetailsPanel } from "../details/details-panel";
import {
	SonarrMappingPanel,
	type SonarrMappingCandidate,
} from "./sonarr-mapping-panel";
import { useSonarrSetupForm } from "./sonarr-setup-form";
import {
	canShowSonarrSetup,
	getSonarrSetupTarget,
} from "./sonarr-setup-values";
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
import type {
	AniListHeaderData,
	MediaModalMetadataHint,
	MediaModalTargetSummary,
	MediaModalView,
	SonarrModalProps,
} from "../types";

const PROVIDER = "sonarr" as const;
const SETUP_FORM_ID = "sonarr-setup-form";

type SonarrStatusSeries = NonNullable<GetSeriesStatusOutput["series"]>;

type SonarrModalData = {
	isConfigured: boolean;
	anilistHeaderData: AniListHeaderData;
	manualMappingActive: boolean;
	currentTarget: MediaModalTargetSummary | null;
	resolvedMetadata: AniListMediaHint | null;
	providerRequestTitle: string;
	providerPayloadTitle: string | undefined;
	fallbackLookupTitle: string | undefined;
	rawProviderStatus: GetSeriesStatusOutput | null;
	verificationSettled: boolean;
	verificationFailed: boolean;
	storedDefaults: ReturnType<typeof defaultSonarrFormState>;
	providerFormResources: ProviderFormResources | null;
};

function getRejectCandidateTvdbId(input: {
	inspection: ReturnType<typeof useMappingInspection>["data"];
	manualMappingActive: boolean;
}): TvdbId | null {
	if (input.manualMappingActive) return null;

	const mapping = input.inspection?.mapping;
	if (mapping?.kind === "mapped" && mapping.source === "auto") {
		return parseTvdbIdOrNull(mapping.providerId);
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

function getEpisodeCount(series: SonarrStatusSeries): number | undefined {
	return (
		series.statistics?.episodeCount ??
		series.statistics?.totalEpisodeCount ??
		("episodeCount" in series ? series.episodeCount : undefined)
	);
}

function getEpisodeFileCount(series: SonarrStatusSeries): number | undefined {
	return (
		series.statistics?.episodeFileCount ??
		("episodeFileCount" in series ? series.episodeFileCount : undefined)
	);
}

function getCurrentTargetDetails(input: {
	series: SonarrStatusSeries;
}): Partial<MediaModalTargetSummary> {
	const { series } = input;
	const episodeCount = getEpisodeCount(series);
	const episodeFileCount = getEpisodeFileCount(series);
	const providerRouteSlug = getProviderRouteSlug(PROVIDER, series) ?? undefined;
	const posterUrl = pickProviderPoster(series);
	const providerFolderName = "folder" in series ? series.folder : undefined;
	const year = "year" in series ? series.year : undefined;
	const typeLabel = "seriesType" in series ? series.seriesType : undefined;

	return {
		...(providerFolderName ? { providerFolderName } : {}),
		...(year === undefined ? {} : { year }),
		...(typeLabel ? { typeLabel } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl ? { posterUrl } : {}),
		...(series.status ? { statusLabel: series.status } : {}),
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(episodeFileCount === undefined ? {} : { episodeFileCount }),
		...("overview" in series && series.overview
			? { overview: series.overview }
			: {}),
	};
}

function getCurrentTarget(input: {
	status: GetSeriesStatusOutput | null;
}): MediaModalTargetSummary | null {
	const { status } = input;
	const series = status?.series;
	const tvdbId = parseTvdbIdOrNull(
		status?.mapping.kind === "mapped" ? status.mapping.providerId : undefined,
	);
	if (!series || tvdbId === null) return null;

	return {
		provider: PROVIDER,
		providerId: tvdbId,
		title: series.title,
		isInLibrary: status.isInLibrary === true,
		...getCurrentTargetDetails({
			series,
		}),
	};
}

function useSonarrModalData(input: {
	anilistId: AniListId;
	source?: SourceIdentity | undefined;
	metadataHint: MediaModalMetadataHint | null;
}): SonarrModalData {
	const { anilistId, source, metadataHint } = input;
	const base = useMediaModalBaseData({ anilistId, metadataHint });
	const options = base.options;
	const isConfigured = options?.providers.sonarr.isConfigured === true;
	const sonarrFormResources = useSonarrFormResources({ enabled: isConfigured });

	const statusPayload = useMemo(
		() => ({
			...(source === undefined ? {} : { source }),
			anilistId,
			...(base.statusTitle === undefined ? {} : { title: base.statusTitle }),
			metadata: base.statusMetadata,
		}),
		[anilistId, base.statusMetadata, base.statusTitle, source],
	);
	const sonarrStatus = useSeriesStatus(statusPayload, {
		enabled: isConfigured && base.statusReady,
		force_verify: true,
	});
	const verificationSettled =
		sonarrStatus.isFetchedAfterMount || sonarrStatus.isError;
	const rawProviderStatus = sonarrStatus.data ?? null;
	const verificationFailed =
		verificationSettled &&
		(sonarrStatus.isError || rawProviderStatus?.isInLibrary === null);
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
			options?.providers.sonarr.defaults ?? defaultSonarrFormState(),
		providerFormResources: sonarrFormResources.data ?? null,
	};
}

export function SonarrModal({
	state,
	onClose,
	container,
}: SonarrModalProps): React.JSX.Element {
	const { anilistId, source, metadataHint, openSource, initialView } = state;
	const [view, setView] = useState<MediaModalView>(initialView ?? "setup");
	const [selectedCandidate, setSelectedCandidate] =
		useState<SonarrMappingCandidate | null>(null);
	const contentContainer = useContentPortalContainer();
	const data = useSonarrModalData({
		anilistId,
		source,
		metadataHint: metadataHint ?? null,
	});
	const inspection = useMappingInspection(
		PROVIDER,
		mappingInspectionInput(anilistId, source),
	);
	const setupTarget = useMemo(
		() =>
			getSonarrSetupTarget({
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
	const canShowSetup = canShowSonarrSetup({
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
	const setupForm = useSonarrSetupForm({
		formId: SETUP_FORM_ID,
		anilistId,
		source,
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
	const rejectCandidateTvdbId = getRejectCandidateTvdbId({
		inspection: inspection.data,
		manualMappingActive: data.manualMappingActive,
	});
	const clearRejectedCandidateTvdbId = parseTvdbIdOrNull(
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
		selectedProviderId: selectedCandidate?.tvdbId ?? null,
		rejectProviderId: rejectCandidateTvdbId,
		clearRejectedProviderId: clearRejectedCandidateTvdbId,
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
					<SonarrMappingPanel
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
							canRejectCandidate={rejectCandidateTvdbId !== null}
							canClearRejectedCandidate={clearRejectedCandidateTvdbId !== null}
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
