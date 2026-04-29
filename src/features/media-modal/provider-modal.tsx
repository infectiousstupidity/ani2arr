/** Owns provider-aware media modal orchestration. */
// src/features/media-modal/provider-modal.tsx

import type { ReactNode } from "react";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import type { Provider } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import { useConfirm } from "@/shared/hooks/use-confirm";
import Button from "@/shared/ui/primitives/button";
import { useMappingInspection } from "@/shared/queries";
import { DetailsPanel } from "./components/details/details-panel";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { MappingHeaderActions } from "./components/mapping/mapping-header-actions";
import { MappingPanel } from "./components/mapping/mapping-panel";
import { RadarrSetupPane } from "./components/setup/radarr-setup-pane";
import { SonarrSetupPane } from "./components/setup/sonarr-setup-pane";
import { useContentPortalContainer } from "./hooks/use-content-portal-container";
import { useMediaModalMappingController } from "./hooks/use-mapping-controller";
import { useMediaModalMappingActions } from "./hooks/use-media-modal-mapping-actions";
import { useOpenMappingSettingsAction } from "./hooks/use-open-mapping-settings-action";
import { useModalRouting } from "./hooks/use-modal-routing";
import { useRadarrModalReadData } from "./hooks/radarr/use-radarr-modal-read-data";
import { useRadarrSetupActions } from "./hooks/radarr/use-radarr-setup-actions";
import { useRadarrSetupForm } from "./hooks/radarr/use-radarr-setup-form";
import { useRadarrSetupTargetController } from "./hooks/radarr/use-radarr-setup-target-controller";
import { useSonarrModalReadData } from "./hooks/sonarr/use-sonarr-modal-read-data";
import { useSonarrSetupActions } from "./hooks/sonarr/use-sonarr-setup-actions";
import { useSonarrSetupForm } from "./hooks/sonarr/use-sonarr-setup-form";
import { useSonarrSetupTargetController } from "./hooks/sonarr/use-sonarr-setup-target-controller";
import { ModalBody } from "./modal-body";
import { isSameSetupTarget, type SetupTarget } from "./setup-target";
import type {
	MediaModalData,
	ProviderModalProps,
	RadarrProviderModalProps,
	SonarrProviderModalProps,
} from "./types";

type SetupFormState = {
	isBusy: boolean;
	isDirty: boolean;
} | null;

type SetupActionsState = {
	isSubmitting: boolean;
	setupMutationsBlocked: boolean;
};

type SetupTargetResolver<TTarget extends SetupTarget> = {
	setupTarget: TTarget | null;
	getSetupTargetForMapping: (mapping: MappingSearchResult) => TTarget | null;
	replaceSetupTarget: (target: TTarget) => void;
};

type SetupPaneRenderer = (input: {
	contentContainer: HTMLDivElement | null;
	setupMode: "add" | "edit";
}) => ReactNode;

type ProviderModalRuntimeProps<TTarget extends SetupTarget> = ProviderModalProps & {
	provider: Provider;
	data: MediaModalData;
	setupFormId: string;
	setupFormState: SetupFormState;
	setupActions: SetupActionsState;
	setupAddLabel: string;
	setupTargetResolver: SetupTargetResolver<TTarget>;
	renderSetupPane: SetupPaneRenderer;
};

type ModalFooterProps = {
	isMappingView: boolean;
	manualMappingActive: boolean;
	canShowSetup: boolean;
	isRevertingMapping: boolean;
	canSubmitMapping: boolean;
	isSubmittingMapping: boolean;
	onResetMapping: () => void | Promise<void>;
	onApplyMapping: () => void | Promise<void>;
	onShowSetup: () => void;
	onClose: () => void;
	setupFormId: string;
	setupUnavailable: boolean;
	setupIsBusy: boolean;
	isSubmittingSetup: boolean;
	setupMutationsBlocked: boolean;
	setupSubmitLabel: string;
};

export function ProviderModal(props: ProviderModalProps): React.JSX.Element {
	const { state } = props;

	if (state.provider === "radarr") {
		return <RadarrProviderModal {...props} state={state} />;
	}

	return <SonarrProviderModal {...props} state={state} />;
}

function SonarrProviderModal({
	state,
	onClose,
	container,
	onMappingSaved,
	onMappingSaveError,
}: SonarrProviderModalProps): React.JSX.Element {
	const {
		anilistId,
		launchStatus = null,
		launchSnapshot = null,
		launchTitle,
		launchMetadata,
	} = state;
	const data = useSonarrModalReadData({
		anilistId,
		launchStatus,
		launchSnapshot,
		...(launchTitle === undefined ? {} : { launchTitle }),
		...(launchMetadata === undefined ? {} : { launchMetadata }),
	});
	const {
		setupTarget,
		getSetupTargetForMapping,
		replaceSetupTarget,
	} = useSonarrSetupTargetController({
		anilistId,
		rawProviderStatus: data.rawProviderStatus,
		providerRequestTitle: data.providerRequestTitle,
		storedDefaults: data.storedDefaults,
	});
	const setupActions = useSonarrSetupActions({
		anilistId,
		setupTarget,
		providerRequestTitle: data.providerRequestTitle,
		...(data.fallbackLookupTitle === undefined
			? {}
			: { fallbackLookupTitle: data.fallbackLookupTitle }),
		...(data.resolvedMetadata === undefined
			? {}
			: { resolvedMetadata: data.resolvedMetadata }),
		verificationSettled: data.verificationSettled,
		verificationFailed: data.verificationFailed,
		onClose,
	});
	const setupFormState = useSonarrSetupForm({
		target: setupTarget,
		providerRequestTitle: data.providerRequestTitle,
		storedDefaults: data.storedDefaults,
		isSubmitting: setupActions.isSubmitting,
		onSubmitDraft: setupActions.submitDraft,
	});

	return (
		<ProviderModalRuntime
			provider="sonarr"
			state={state}
			onClose={onClose}
			data={data}
			setupFormId="sonarr-setup-form"
			setupFormState={setupFormState}
			setupActions={setupActions}
			setupAddLabel="Add series"
			setupTargetResolver={{
				setupTarget,
				getSetupTargetForMapping,
				replaceSetupTarget,
			}}
			renderSetupPane={({ contentContainer, setupMode }) => (
				<SonarrSetupPane
					formId="sonarr-setup-form"
					formState={setupFormState}
					isConfigured={data.isConfigured}
					metadata={data.providerMetadata ?? null}
					mode={setupMode}
					portalContainer={contentContainer}
					setupMutationsBlocked={setupActions.setupMutationsBlocked}
					verificationFailed={data.verificationFailed}
					verificationSettled={data.verificationSettled}
					hasExistingItem={setupTarget?.setupMode === "edit"}
				/>
			)}
			{...(container ? { container } : {})}
			{...(onMappingSaved ? { onMappingSaved } : {})}
			{...(onMappingSaveError ? { onMappingSaveError } : {})}
		/>
	);
}

function RadarrProviderModal({
	state,
	onClose,
	container,
	onMappingSaved,
	onMappingSaveError,
}: RadarrProviderModalProps): React.JSX.Element {
	const {
		anilistId,
		launchStatus = null,
		launchSnapshot = null,
		launchTitle,
		launchMetadata,
	} = state;
	const data = useRadarrModalReadData({
		anilistId,
		launchStatus,
		launchSnapshot,
		...(launchTitle === undefined ? {} : { launchTitle }),
		...(launchMetadata === undefined ? {} : { launchMetadata }),
	});
	const {
		setupTarget,
		getSetupTargetForMapping,
		replaceSetupTarget,
	} = useRadarrSetupTargetController({
		anilistId,
		rawProviderStatus: data.rawProviderStatus,
		providerRequestTitle: data.providerRequestTitle,
		storedDefaults: data.storedDefaults,
	});
	const setupActions = useRadarrSetupActions({
		anilistId,
		setupTarget,
		providerRequestTitle: data.providerRequestTitle,
		...(data.fallbackLookupTitle === undefined
			? {}
			: { fallbackLookupTitle: data.fallbackLookupTitle }),
		...(data.resolvedMetadata === undefined
			? {}
			: { resolvedMetadata: data.resolvedMetadata }),
		verificationSettled: data.verificationSettled,
		verificationFailed: data.verificationFailed,
		onClose,
	});
	const setupFormState = useRadarrSetupForm({
		target: setupTarget,
		providerRequestTitle: data.providerRequestTitle,
		storedDefaults: data.storedDefaults,
		isSubmitting: setupActions.isSubmitting,
		onSubmitDraft: setupActions.submitDraft,
	});

	return (
		<ProviderModalRuntime
			provider="radarr"
			state={state}
			onClose={onClose}
			data={data}
			setupFormId="radarr-setup-form"
			setupFormState={setupFormState}
			setupActions={setupActions}
			setupAddLabel="Add movie"
			setupTargetResolver={{
				setupTarget,
				getSetupTargetForMapping,
				replaceSetupTarget,
			}}
			renderSetupPane={({ contentContainer, setupMode }) => (
				<RadarrSetupPane
					formId="radarr-setup-form"
					formState={setupFormState}
					isConfigured={data.isConfigured}
					metadata={data.providerMetadata ?? null}
					mode={setupMode}
					portalContainer={contentContainer}
					setupMutationsBlocked={setupActions.setupMutationsBlocked}
					verificationFailed={data.verificationFailed}
					verificationSettled={data.verificationSettled}
					hasExistingItem={setupTarget?.setupMode === "edit"}
				/>
			)}
			{...(container ? { container } : {})}
			{...(onMappingSaved ? { onMappingSaved } : {})}
			{...(onMappingSaveError ? { onMappingSaveError } : {})}
		/>
	);
}

function ProviderModalRuntime<TTarget extends SetupTarget>({
	provider,
	state,
	onClose,
	container,
	onMappingSaved,
	onMappingSaveError,
	data,
	setupFormId,
	setupFormState,
	setupActions,
	setupAddLabel,
	setupTargetResolver,
	renderSetupPane,
}: ProviderModalRuntimeProps<TTarget>): React.JSX.Element {
	const { anilistId, openSource, initialView } = state;
	const confirm = useConfirm();
	const contentContainer = useContentPortalContainer();
	const inspection = useMappingInspection(provider, anilistId);
	const {
		isMappingView,
		canShowSetup,
		modeSwitchLabel,
		handleModeSwitch,
		showSetupView,
		setupMode,
	} = useModalRouting({
		initialView: initialView ?? null,
		isConfigured: data.isConfigured,
		providerStatus: data.rawProviderStatus,
		setupModeOverride: setupTargetResolver.setupTarget?.setupMode ?? null,
	});
	const controller = useMediaModalMappingController({
		provider,
		anilistId,
		currentMapping: data.currentMapping,
		manualMappingActive: data.manualMappingActive,
		authoritativeMapping: inspection.data?.effectiveMapping ?? null,
	});
	const { state: mappingState, actions: mappingActions } = controller;

	const routeToMappingTarget = async (
		mapping: MappingSearchResult,
	): Promise<boolean> => {
		const nextTarget =
			setupTargetResolver.getSetupTargetForMapping(mapping);
		if (nextTarget === null) {
			return false;
		}

		if (isSameSetupTarget(setupTargetResolver.setupTarget, nextTarget)) {
			showSetupView();
			return true;
		}

		if (setupFormState?.isDirty === true) {
			const providerLabel = getProviderLabel(provider);
			const didConfirm = await confirm({
				title: "Discard setup changes?",
				description: `Changing the ${providerLabel} target will replace the current setup form and discard unsaved setup changes.`,
				confirmText: "Discard changes",
				cancelText: "Keep editing",
			});

			if (!didConfirm) {
				return false;
			}
		}

		setupTargetResolver.replaceSetupTarget(nextTarget);
		showSetupView();
		return true;
	};

	const {
		handleApplyMapping,
		handleResetMapping,
		handleIgnoreTitle,
		handleRejectCandidate,
		handleClearRejectedCandidate,
	} = useMediaModalMappingActions({
		anilistId,
		selectedMapping: mappingState.selectedResult,
		mappingActions,
		routeToMappingTarget,
		onClose,
		...(onMappingSaved ? { onMappingSaved } : {}),
		...(onMappingSaveError ? { onMappingSaveError } : {}),
	});

	const handleOpenSettings = useOpenMappingSettingsAction({
		anilistId,
		openSource,
	});
	const mappingActionButtons = isMappingView ? (
		<MappingHeaderActions
			canRejectCandidate={mappingState.canRejectCandidate}
			canClearRejectedCandidate={mappingState.canClearRejectedCandidate}
			canIgnoreTitle={mappingState.canIgnoreTitle}
			isRejectingCandidate={mappingState.isRejectingCandidate}
			isClearingRejectedCandidate={mappingState.isClearingRejectedCandidate}
			isIgnoring={mappingState.isIgnoring}
			onRejectCandidate={handleRejectCandidate}
			onClearRejectedCandidate={handleClearRejectedCandidate}
			onIgnoreTitle={handleIgnoreTitle}
		/>
	) : null;

	return (
		<ModalBody
			provider={provider}
			baseUrl={data.baseUrl}
			contentContainer={contentContainer}
			header={
				<Header
					anilistHeaderData={data.anilistHeaderData}
					anilistId={anilistId}
					effectiveMapping={mappingState.effectiveMapping}
					onClose={onClose}
					{...(handleOpenSettings ? { onOpenSettings: handleOpenSettings } : {})}
					{...(modeSwitchLabel ? { modeSwitchLabel } : {})}
					{...(handleModeSwitch ? { onModeSwitch: handleModeSwitch } : {})}
					{...(mappingActionButtons ? { providerActions: mappingActionButtons } : {})}
				/>
			}
			leftPane={
				isMappingView ? (
					<MappingPanel
						query={mappingState.query}
						searchResults={mappingState.results}
						isSearching={mappingState.isSearching}
						selectedResult={mappingState.selectedResult}
						effectiveMapping={mappingState.effectiveMapping}
						inspectionQuery={inspection}
						onQueryChange={mappingActions.setQuery}
						onSelectResult={mappingActions.selectResult}
					/>
				) : (
					renderSetupPane({ contentContainer, setupMode })
				)
			}
			rightPane={
				<DetailsPanel
					anilistId={anilistId}
					effectiveMapping={mappingState.effectiveMapping}
					previewMapping={isMappingView ? mappingState.previewMapping : null}
					isInMappingMode={isMappingView}
					inspectionQuery={inspection}
					onClearPreview={mappingActions.clearSelection}
				/>
			}
			footer={
				<ModalFooter
					isMappingView={isMappingView}
					manualMappingActive={data.manualMappingActive}
					canShowSetup={canShowSetup}
					isRevertingMapping={mappingState.isReverting}
					canSubmitMapping={mappingState.canSubmit}
					isSubmittingMapping={mappingState.isSubmitting}
					onResetMapping={handleResetMapping}
					onApplyMapping={handleApplyMapping}
					onShowSetup={showSetupView}
					onClose={onClose}
					setupFormId={setupFormId}
					setupUnavailable={setupFormState === null}
					setupIsBusy={setupFormState?.isBusy ?? setupActions.isSubmitting}
					isSubmittingSetup={setupActions.isSubmitting}
					setupMutationsBlocked={setupActions.setupMutationsBlocked}
					setupSubmitLabel={setupMode === "edit" ? "Save changes" : setupAddLabel}
				/>
			}
			onOpenChange={(open) => !open && onClose()}
			{...(container ? { container } : {})}
		/>
	);
}

function ModalFooter({
	isMappingView,
	manualMappingActive,
	canShowSetup,
	isRevertingMapping,
	canSubmitMapping,
	isSubmittingMapping,
	onResetMapping,
	onApplyMapping,
	onShowSetup,
	onClose,
	setupFormId,
	setupUnavailable,
	setupIsBusy,
	isSubmittingSetup,
	setupMutationsBlocked,
	setupSubmitLabel,
}: ModalFooterProps): React.JSX.Element {
	if (isMappingView) {
		return (
			<Footer
				left={
					manualMappingActive ? (
						<Button
							onClick={() => void onResetMapping()}
							variant="outline"
							size="sm"
							disabled={isRevertingMapping}
						>
							Reset to automatic
						</Button>
					) : null
				}
				right={
					<>
						<Button
							onClick={canShowSetup ? onShowSetup : onClose}
							variant="outline"
							size="sm"
						>
							{canShowSetup ? "Back to setup" : "Exit modal"}
						</Button>
						<Button
							onClick={() => void onApplyMapping()}
							variant="primary"
							size="sm"
							disabled={!canSubmitMapping}
							isLoading={isSubmittingMapping}
						>
							Confirm Selection
						</Button>
					</>
				}
			/>
		);
	}

	return (
		<Footer
			right={
				<>
					<Button
						onClick={onClose}
						variant="outline"
						size="sm"
						disabled={setupIsBusy}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={setupFormId}
						variant="primary"
						size="sm"
						disabled={setupUnavailable || setupMutationsBlocked}
						isLoading={isSubmittingSetup}
					>
						{setupSubmitLabel}
					</Button>
				</>
			}
		/>
	);
}
