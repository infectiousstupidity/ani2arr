/** Concrete Radarr media modal composition and direct data flow. */
// src/features/media-modal/radarr/radarr-modal.tsx

import { useMemo, useState } from "react";
import type { AniListId } from "@/anilist";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import {
	parseTmdbIdOrNull,
	type ProviderFormResources,
	type TmdbId,
} from "@/providers";
import {
	useMappingInspection,
} from "@/queries/mapping";
import { useProviderBaseUrl } from "@/queries/provider-base-url";
import { useMovieStatus, useRadarrFormResources } from "@/queries/radarr";
import type { CheckMovieStatusResponse } from "@/rpc/types";
import { defaultRadarrFormState } from "@/settings";
import { DetailsPanel } from "../details/details-panel";
import { useContentPortalContainer } from "../hooks/use-content-portal-container";
import { useMappingActions } from "../hooks/use-mapping-actions";
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import { useOpenMappingSettingsAction } from "../hooks/use-open-mapping-settings-action";
import { targetsEqual } from "../helpers";
import { MappingFooter, SetupFooter } from "../chrome/modal-footer";
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
	baseUrl: string;
	isConfigured: boolean;
	anilistHeaderData: AniListHeaderData;
	manualMappingActive: boolean;
	currentTarget: MediaModalTargetSummary | null;
	resolvedMetadata: AniListMediaHint | null;
	providerRequestTitle: string;
	providerPayloadTitle: string | undefined;
	fallbackLookupTitle: string | undefined;
	rawProviderStatus: CheckMovieStatusResponse | null;
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

	const effectiveMapping = input.inspection?.effectiveMapping;
	if (
		(effectiveMapping?.mappingEntryKind === "auto" ||
			effectiveMapping?.mappingEntryKind === "upstream") &&
		effectiveMapping.providerId != null
	) {
		return parseTmdbIdOrNull(effectiveMapping.providerId);
	}

	return null;
}

function useRadarrModalData(input: {
	anilistId: AniListId;
	metadataHint: MediaModalMetadataHint | null;
}): RadarrModalData {
	const { anilistId, metadataHint } = input;
	const base = useMediaModalBaseData({ anilistId, metadataHint });
	const options = base.options;
	const isConfigured = options?.providers.radarr.isConfigured === true;
	const providerBaseUrl = useProviderBaseUrl(PROVIDER, {
		enabled: isConfigured,
	});
	const radarrFormResources = useRadarrFormResources({ enabled: isConfigured });

	const statusPayload = useMemo(
		() => ({
			anilistId,
			...(base.providerPayloadTitle === undefined
				? {}
				: { title: base.providerPayloadTitle }),
			metadata: base.resolvedMetadata,
		}),
		[anilistId, base.providerPayloadTitle, base.resolvedMetadata],
	);
	const radarrStatus = useMovieStatus(statusPayload, {
		enabled: isConfigured,
		force_verify: true,
	});
	const verificationSettled =
		radarrStatus.isFetchedAfterMount || radarrStatus.isError;
	const rawProviderStatus = radarrStatus.data ?? null;
	const verificationFailed =
		verificationSettled &&
		(radarrStatus.isError || rawProviderStatus?.isInLibrary === null);
	const baseUrl = providerBaseUrl.data ?? "";
	const currentTarget = rawProviderStatus?.targetSummary ?? null;

	return {
		baseUrl,
		isConfigured,
		anilistHeaderData: base.anilistHeaderData,
		manualMappingActive: rawProviderStatus?.manualMappingActive === true,
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
	const { anilistId, metadataHint, openSource, initialView } = state;
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
		verificationFailed: data.verificationFailed,
		verificationSettled: data.verificationSettled,
		onClose,
	});
	const isMappingView = view === "mapping" || !canShowSetup;
	const handleOpenSettings = useOpenMappingSettingsAction({
		anilistId,
		openSource,
	});
	const rejectCandidateTmdbId = getRejectCandidateTmdbId({
		inspection: inspection.data,
		manualMappingActive: data.manualMappingActive,
	});
	const clearRejectedCandidateTmdbId = parseTmdbIdOrNull(
		inspection.data?.effectiveMapping.suppressedProviderId,
	);
	const canIgnoreTitle =
		inspection.data?.effectiveMapping.mappingEntryKind !== "ignored";
	const canSubmitMapping =
		selectedCandidate !== null &&
		!targetsEqual(selectedCandidate.summary, data.currentTarget);
	const showSetupView = (): void => setView("setup");
	const mappingActions = useMappingActions({
		anilistId,
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

	return (
		<ModalShell
			contentContainer={contentContainer}
			header={
				<ModalHeader
					provider={PROVIDER}
					baseUrl={data.baseUrl}
					contentContainer={contentContainer}
					anilistHeaderData={data.anilistHeaderData}
					anilistId={anilistId}
					effectiveMapping={data.currentTarget}
					onClose={onClose}
					onOpenSettings={handleOpenSettings ?? undefined}
				/>
			}
			leftPane={
				isMappingView ? (
					<RadarrMappingPanel
						baseUrl={data.baseUrl}
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
					baseUrl={data.baseUrl}
					contentContainer={contentContainer}
					anilistId={anilistId}
					effectiveMapping={data.currentTarget}
					previewMapping={
						isMappingView ? (selectedCandidate?.summary ?? null) : null
					}
					isInMappingMode={isMappingView}
					mappingDetails={inspection.data}
					onClearPreview={() => setSelectedCandidate(null)}
				/>
			}
			footer={
				isMappingView ? (
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
						onCancel={onClose}
						onOpenMapping={showMappingView}
					/>
				)
			}
			onOpenChange={(open) => !open && onClose()}
			container={container}
		/>
	);
}
