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
import { useMovieStatus, useRadarrFormResources } from "@/queries/radarr";
import type { CheckMovieStatusResponse } from "@/rpc/types";
import { defaultRadarrFormState } from "@/settings";
import { useConfirm } from "@/shared/hooks/use-confirm";
import { DetailsPanel } from "../details/details-panel";
import { MappingHeaderActions } from "../mapping/mapping-header-actions";
import { useContentPortalContainer } from "../hooks/use-content-portal-container";
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import { useOpenMappingSettingsAction } from "../hooks/use-open-mapping-settings-action";
import { targetsEqual } from "../helpers";
import { ModalFooter } from "../chrome/modal-footer";
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

function getModeSwitchLabel(input: {
	isMappingView: boolean;
	canShowSetup: boolean;
}): string | null {
	if (!input.isMappingView) {
		return "Change mapping";
	}

	return input.canShowSetup ? "Back to setup" : null;
}

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
	const confirm = useConfirm();
	const contentContainer = useContentPortalContainer();
	const data = useRadarrModalData({
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
	const modeSwitchLabel = getModeSwitchLabel({ isMappingView, canShowSetup });
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
			providerId: selectedCandidate.tmdbId,
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
		if (rejectCandidateTmdbId === null) return;

		await setRejectedCandidate.mutateAsync({
			anilistId,
			provider: PROVIDER,
			providerId: rejectCandidateTmdbId,
		});
	};
	const handleClearRejectedCandidate = async (): Promise<void> => {
		if (clearRejectedCandidateTmdbId === null) return;

		await clearRejectedCandidate.mutateAsync({
			anilistId,
			provider: PROVIDER,
			providerId: clearRejectedCandidateTmdbId,
		});
	};
	const mappingActionButtons = isMappingView ? (
		<MappingHeaderActions
			canRejectCandidate={rejectCandidateTmdbId !== null}
			canClearRejectedCandidate={clearRejectedCandidateTmdbId !== null}
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
