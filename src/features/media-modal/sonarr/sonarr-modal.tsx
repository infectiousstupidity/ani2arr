/** Concrete Sonarr media modal composition and direct data flow. */
// src/features/media-modal/sonarr/sonarr-modal.tsx

import { useMemo, useState } from "react";
import type { AniListId } from "@/anilist";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import {
	parseTvdbIdOrNull,
	type ProviderFormResources,
	type TvdbId,
} from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import {
	useClearManualMapping,
	useClearMappingRejectedCandidate,
	useMappingInspection,
	useSetMappingIgnore,
	useSetMappingRejectedCandidate,
	useSetManualMapping,
} from "@/queries/mapping";
import { useProviderBaseUrl } from "@/queries/provider-base-url";
import { useSeriesStatus, useSonarrFormResources } from "@/queries/sonarr";
import { defaultSonarrFormState } from "@/settings";
import { useConfirm } from "@/shared/hooks/use-confirm";
import type { CheckSeriesStatusResponse } from "@/rpc/types";
import { DetailsPanel } from "../details/details-panel";
import { MappingHeaderActions } from "../mapping/mapping-header-actions";
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
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import { useOpenMappingSettingsAction } from "../hooks/use-open-mapping-settings-action";
import { targetsEqual } from "../helpers";
import { ModalFooter } from "../chrome/modal-footer";
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

type SonarrModalData = {
	baseUrl: string;
	isConfigured: boolean;
	anilistHeaderData: AniListHeaderData;
	manualMappingActive: boolean;
	currentTarget: MediaModalTargetSummary | null;
	resolvedMetadata: AniListMediaHint | null;
	providerRequestTitle: string;
	providerPayloadTitle: string | undefined;
	fallbackLookupTitle: string | undefined;
	rawProviderStatus: CheckSeriesStatusResponse | null;
	verificationSettled: boolean;
	verificationFailed: boolean;
	storedDefaults: ReturnType<typeof defaultSonarrFormState>;
	providerFormResources: ProviderFormResources | null;
};

function getModeSwitchLabel(input: {
	isMappingView: boolean;
	canShowSetup: boolean;
}): string | null {
	if (!input.isMappingView) {
		return "Change mapping";
	}

	return input.canShowSetup ? "Back to setup" : null;
}

function getRejectCandidateTvdbId(input: {
	inspection: ReturnType<typeof useMappingInspection>["data"];
	manualMappingActive: boolean;
}): TvdbId | null {
	if (input.manualMappingActive) return null;

	const effectiveMapping = input.inspection?.effectiveMapping;
	if (
		(effectiveMapping?.mappingEntryKind === "auto" ||
			effectiveMapping?.mappingEntryKind === "upstream") &&
		effectiveMapping.providerId != null
	) {
		return parseTvdbIdOrNull(effectiveMapping.providerId);
	}

	return null;
}

function useSonarrModalData(input: {
	anilistId: AniListId;
	metadataHint: MediaModalMetadataHint | null;
}): SonarrModalData {
	const { anilistId, metadataHint } = input;
	const base = useMediaModalBaseData({ anilistId, metadataHint });
	const options = base.options;
	const isConfigured = options?.providers.sonarr.isConfigured === true;
	const providerBaseUrl = useProviderBaseUrl(PROVIDER, {
		enabled: isConfigured,
	});
	const sonarrFormResources = useSonarrFormResources({ enabled: isConfigured });

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
	const sonarrStatus = useSeriesStatus(statusPayload, {
		enabled: isConfigured,
		force_verify: true,
	});
	const verificationSettled =
		sonarrStatus.isFetchedAfterMount || sonarrStatus.isError;
	const rawProviderStatus = sonarrStatus.data ?? null;
	const verificationFailed =
		verificationSettled &&
		(sonarrStatus.isError || rawProviderStatus?.isInLibrary === null);
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
			options?.providers.sonarr.defaults ?? defaultSonarrFormState(),
		providerFormResources: sonarrFormResources.data ?? null,
	};
}

export function SonarrModal({
	state,
	onClose,
	container,
}: SonarrModalProps): React.JSX.Element {
	const { anilistId, metadataHint, openSource, initialView } = state;
	const [view, setView] = useState<MediaModalView>(initialView ?? "setup");
	const [selectedCandidate, setSelectedCandidate] =
		useState<SonarrMappingCandidate | null>(null);
	const confirm = useConfirm();
	const contentContainer = useContentPortalContainer();
	const data = useSonarrModalData({
		anilistId,
		metadataHint: metadataHint ?? null,
	});
	const inspection = useMappingInspection(PROVIDER, anilistId);
	const setManualMapping = useSetManualMapping();
	const clearManualMapping = useClearManualMapping();
	const setIgnore = useSetMappingIgnore();
	const setRejectedCandidate = useSetMappingRejectedCandidate();
	const clearRejectedCandidate = useClearMappingRejectedCandidate();
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
	const setupForm = useSonarrSetupForm({
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
	const modeSwitchLabel = getModeSwitchLabel({ isMappingView, canShowSetup });
	const handleOpenSettings = useOpenMappingSettingsAction({
		anilistId,
		openSource,
	});
	const rejectCandidateTvdbId = getRejectCandidateTvdbId({
		inspection: inspection.data,
		manualMappingActive: data.manualMappingActive,
	});
	const clearRejectedCandidateTvdbId = parseTvdbIdOrNull(
		inspection.data?.effectiveMapping.suppressedProviderId,
	);
	const canIgnoreTitle =
		inspection.data?.effectiveMapping.mappingEntryKind !== "ignored";
	const canSubmitMapping =
		selectedCandidate !== null &&
		!targetsEqual(selectedCandidate.summary, data.currentTarget);
	const showSetupView = (): void => setView("setup");
	const handleModeSwitch =
		modeSwitchLabel === null
			? undefined
			: (): void => setView(isMappingView ? "setup" : "mapping");
	const handleApplyMapping = async (): Promise<void> => {
		if (selectedCandidate === null) return;

		if (
			setupForm.footerState.isDirty &&
			!targetsEqual(selectedCandidate.summary, data.currentTarget)
		) {
			const providerLabel = getProviderLabel(PROVIDER);
			const didConfirm = await confirm({
				title: "Discard setup changes?",
				description: `Changing the ${providerLabel} target will replace the current setup form and discard unsaved setup changes.`,
				confirmText: "Discard changes",
				cancelText: "Keep editing",
			});

			if (!didConfirm) return;
		}

		await setManualMapping.mutateAsync({
			anilistId,
			provider: PROVIDER,
			providerId: selectedCandidate.tvdbId,
		});
		setSelectedCandidate(null);
		showSetupView();
	};
	const handleResetMapping = async (): Promise<void> => {
		await clearManualMapping.mutateAsync({ anilistId, provider: PROVIDER });
		setSelectedCandidate(null);
		setView("mapping");
	};
	const handleIgnoreTitle = async (): Promise<void> => {
		const didConfirm = await confirm({
			title: "Ignore this title entirely?",
			description:
				"ani2arr will stop using automatic or upstream matches for this AniList entry until you remove the title ignore or save a manual mapping.",
			confirmText: "Ignore title",
			cancelText: "Cancel",
		});

		if (!didConfirm) return;

		await setIgnore.mutateAsync({ anilistId, provider: PROVIDER });
		onClose();
	};
	const handleRejectCandidate = async (): Promise<void> => {
		if (rejectCandidateTvdbId === null) return;

		await setRejectedCandidate.mutateAsync({
			anilistId,
			provider: PROVIDER,
			providerId: rejectCandidateTvdbId,
		});
	};
	const handleClearRejectedCandidate = async (): Promise<void> => {
		if (clearRejectedCandidateTvdbId === null) return;

		await clearRejectedCandidate.mutateAsync({
			anilistId,
			provider: PROVIDER,
			providerId: clearRejectedCandidateTvdbId,
		});
	};
	const mappingActionButtons = isMappingView ? (
		<MappingHeaderActions
			canRejectCandidate={rejectCandidateTvdbId !== null}
			canClearRejectedCandidate={clearRejectedCandidateTvdbId !== null}
			canIgnoreTitle={canIgnoreTitle}
			isRejectingCandidate={setRejectedCandidate.isPending}
			isClearingRejectedCandidate={clearRejectedCandidate.isPending}
			isIgnoring={setIgnore.isPending}
			onRejectCandidate={handleRejectCandidate}
			onClearRejectedCandidate={handleClearRejectedCandidate}
			onIgnoreTitle={handleIgnoreTitle}
		/>
	) : null;

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
					modeSwitchLabel={modeSwitchLabel}
					onModeSwitch={handleModeSwitch}
					providerActions={mappingActionButtons}
				/>
			}
			leftPane={
				isMappingView ? (
					<SonarrMappingPanel
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
					inspectionQuery={inspection}
					onClearPreview={() => setSelectedCandidate(null)}
				/>
			}
			footer={
				<ModalFooter
					isMappingView={isMappingView}
					manualMappingActive={data.manualMappingActive}
					canShowSetup={canShowSetup}
					isRevertingMapping={clearManualMapping.isPending}
					canSubmitMapping={canSubmitMapping}
					isSubmittingMapping={setManualMapping.isPending}
					onResetMapping={handleResetMapping}
					onApplyMapping={handleApplyMapping}
					onShowSetup={showSetupView}
					onClose={onClose}
					setupFormId={SETUP_FORM_ID}
					setupUnavailable={setupForm.footerState.setupUnavailable}
					setupIsBusy={setupForm.footerState.isBusy}
					isSubmittingSetup={setupForm.footerState.isSubmitting}
					setupMutationsBlocked={setupForm.footerState.setupMutationsBlocked}
					setupSubmitLabel={setupForm.footerState.submitLabel}
				/>
			}
			onOpenChange={(open) => !open && onClose()}
			container={container}
		/>
	);
}
