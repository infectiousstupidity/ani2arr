/** Shared Sonarr/Radarr modal composition: view switching, mapping actions and chrome. */

import { useState } from "react";
import type { AniListId } from "@/anilist/types";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import { useMappingInspection, useSourceAniListIdMap } from "@/queries/mapping";
import type { MappingDetailsPayload } from "@/rpc/types";
import { MappingFooter, SetupFooter } from "./chrome/modal-footer";
import { ModalHeader } from "./chrome/modal-header";
import { ModalShell } from "./chrome/modal-shell";
import { DetailsPanel } from "./details/details-panel";
import { getOverwriteTargetTitle, targetsEqual } from "./helpers";
import { useMappingActions } from "./hooks/use-mapping-actions";
import { useOpenMappingSettingsAction } from "./hooks/use-open-mapping-settings-action";
import type { MappingPanelProps } from "./mapping/mapping-search-shell";
import type {
	AniListHeaderData,
	MediaModalContainer,
	MediaModalTargetSummary,
	MediaModalView,
	RadarrModalProps,
	SonarrModalProps,
} from "./types";

type ArrModalFrameProps = {
	state: SonarrModalProps["state"] | RadarrModalProps["state"];
	onClose: () => void;
	container: MediaModalContainer | undefined;
	contentContainer: HTMLDivElement | null;
	anilistHeaderData: AniListHeaderData;
	currentTarget: MediaModalTargetSummary | null;
	manualMappingActive: boolean;
	verificationSettled: boolean;
	canShowSetup: boolean;
	setupTargetLoading: boolean;
	setupFormId: string;
	setupForm: {
		content: React.JSX.Element;
		footerState: {
			canSubmit: boolean;
			isBusy: boolean;
			isDirty: boolean;
			isSubmitting: boolean;
			submitLabel: string;
			actionError: string | null;
		};
	};
	MappingPanel: (props: MappingPanelProps) => React.JSX.Element;
};

function getModalAniListId(
	source: ArrModalFrameProps["state"]["source"],
	idsBySource: Record<string, AniListId | null> | undefined,
): AniListId | undefined {
	if (source.source === "anilist") return source.id;
	return idsBySource?.[sourceIdentityKey(source)] ?? undefined;
}

/** Candidate IDs the mapping footer can reject or un-reject for the current mapping. */
function getRejectionCandidateIds(input: {
	provider: ArrModalFrameProps["state"]["provider"];
	mapping: MappingDetailsPayload["mapping"] | undefined;
	manualMappingActive: boolean;
}) {
	const { provider, mapping, manualMappingActive } = input;
	const parseProviderId =
		provider === "sonarr" ? parseTvdbIdOrNull : parseTmdbIdOrNull;

	return {
		rejectCandidateId:
			!manualMappingActive &&
			mapping?.kind === "mapped" &&
			mapping.source === "auto"
				? parseProviderId(mapping.providerId)
				: null,
		clearRejectedCandidateId: parseProviderId(
			mapping?.kind === "unmapped"
				? mapping.rejectedProviderIds?.[0]
				: undefined,
		),
	};
}

export function ArrModalFrame(props: ArrModalFrameProps): React.JSX.Element {
	const {
		state,
		onClose,
		container,
		contentContainer,
		anilistHeaderData,
		currentTarget,
		manualMappingActive,
		verificationSettled,
		canShowSetup,
		setupTargetLoading,
		setupFormId,
		setupForm,
		MappingPanel,
	} = props;
	const { provider, source, openSource, initialView } = state;
	const sourceAniListIds = useSourceAniListIdMap([source], {
		enabled: source.source === "mal",
	});
	const anilistId = getModalAniListId(source, sourceAniListIds.data);
	const [view, setView] = useState<MediaModalView>(initialView ?? "setup");
	const [selectedCandidate, setSelectedCandidate] =
		useState<MediaModalTargetSummary | null>(null);
	const inspection = useMappingInspection(provider, source);
	const mapping = inspection.data?.mapping;
	const isMappingView =
		view === "mapping" || (verificationSettled && !canShowSetup);
	const previewTarget = isMappingView ? selectedCandidate : null;
	const handleOpenSettings = useOpenMappingSettingsAction({
		anilistId,
		openSource,
	});
	const { rejectCandidateId, clearRejectedCandidateId } =
		getRejectionCandidateIds({ provider, mapping, manualMappingActive });
	const canSubmitMapping =
		selectedCandidate !== null &&
		!targetsEqual(selectedCandidate, currentTarget);
	const showSetupView = (): void => {
		setSelectedCandidate(null);
		setView("setup");
	};
	const mappingActions = useMappingActions({
		source,
		provider,
		selectedProviderId: selectedCandidate?.providerId ?? null,
		rejectProviderId: rejectCandidateId,
		clearRejectedProviderId: clearRejectedCandidateId,
		requiresApplyConfirmation:
			setupForm.footerState.isDirty && canSubmitMapping,
		onMappingApplied: showSetupView,
		onMappingReset: () => {
			setSelectedCandidate(null);
			setView("mapping");
		},
		onIgnored: onClose,
	});
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
					provider={provider}
					contentContainer={contentContainer}
					anilistHeaderData={anilistHeaderData}
					source={source}
					isMappingView={isMappingView}
					isProviderTargetLoading={!isMappingView && setupTargetLoading}
					currentTarget={currentTarget}
					previewTarget={previewTarget}
					onClose={onClose}
					onOpenSettings={handleOpenSettings ?? undefined}
				/>
			}
			leftPane={
				isMappingView ? (
					<MappingPanel
						contentContainer={contentContainer}
						currentTarget={currentTarget}
						selectedCandidate={selectedCandidate}
						onSelectCandidate={setSelectedCandidate}
					/>
				) : (
					setupForm.content
				)
			}
			rightPane={
				<DetailsPanel
					provider={provider}
					contentContainer={contentContainer}
					anilistId={anilistId}
					effectiveMapping={currentTarget}
					previewMapping={previewTarget}
					isInMappingMode={isMappingView}
					mappingDetails={inspection.data}
				/>
			}
			footer={
				isMappingView ? (
					<MappingFooter
						manualMappingActive={manualMappingActive}
						isResettingMapping={mappingActions.isRevertingMapping}
						canRejectCandidate={rejectCandidateId !== null}
						canClearRejectedCandidate={clearRejectedCandidateId !== null}
						canIgnoreTitle={mapping?.kind !== "ignored"}
						isRejectingCandidate={mappingActions.isRejectingCandidate}
						isClearingRejectedCandidate={
							mappingActions.isClearingRejectedCandidate
						}
						isIgnoring={mappingActions.isIgnoring}
						canApplyMapping={canSubmitMapping}
						isApplyingMapping={mappingActions.isSubmittingMapping}
						leaveMappingLabel={canShowSetup ? "Back to setup" : "Exit modal"}
						overwriteTargetTitle={getOverwriteTargetTitle(
							previewTarget,
							currentTarget,
						)}
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
						formId={setupFormId}
						canSubmit={setupForm.footerState.canSubmit}
						isBusy={setupForm.footerState.isBusy}
						isSubmitting={setupForm.footerState.isSubmitting}
						submitLabel={setupForm.footerState.submitLabel}
						actionError={setupForm.footerState.actionError}
						onCancel={onClose}
						onOpenMapping={() => setView("mapping")}
					/>
				)
			}
			onOpenChange={(open) => !open && onClose()}
			onEscapeKeyDown={handleEscapeKeyDown}
			container={container}
		/>
	);
}
