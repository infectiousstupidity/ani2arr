/** Renders Sonarr setup content for the media modal left pane. */
// src/features/media-modal/components/setup/sonarr-setup-pane.tsx

import type { ComponentProps } from "react";
import { SonarrAddOptionsFields } from "@/components/provider-add-options/sonarr-add-options-fields";
import { SonarrEditOptionsFields } from "@/components/provider-add-options/sonarr-edit-options-fields";
import { BaseProviderSetupPanel } from "./provider-setup-panel";
import type { SonarrSetupFormState } from "../../hooks/sonarr/use-sonarr-setup-form";

type SonarrProviderFormOptions = ComponentProps<
	typeof SonarrAddOptionsFields
>["formOptions"];
type SonarrPortalContainer = ComponentProps<
	typeof SonarrAddOptionsFields
>["portalContainer"];

interface SonarrSetupPaneProps {
	formId: string;
	formState: SonarrSetupFormState | null;
	isConfigured: boolean;
	formOptions: SonarrProviderFormOptions | null;
	mode: "add" | "edit";
	portalContainer: SonarrPortalContainer;
	setupMutationsBlocked: boolean;
	verificationFailed: boolean;
	verificationSettled: boolean;
	hasExistingItem: boolean;
}

function getSonarrSetupStatusNotice(input: {
	verificationFailed: boolean;
	verificationSettled: boolean;
	mode: "add" | "edit";
	hasExistingItem: boolean;
}): string | null {
	if (input.verificationFailed) {
		return "Unable to verify the current Sonarr library status right now. Setup changes stay disabled until verification succeeds.";
	}

	if (!input.verificationSettled) {
		return input.mode === "edit"
			? "Verifying the current Sonarr item before enabling edit actions."
			: "Verifying the current Sonarr status before enabling setup changes.";
	}

	if (input.mode === "edit" && !input.hasExistingItem) {
		return "Refreshing Sonarr item details before enabling edit actions.";
	}

	return null;
}

function getHeaderDescription(mode: "add" | "edit"): string {
	return mode === "edit"
		? "Update the folder and whole-series settings, then optionally apply a one-time episode monitoring action."
		: "Choose the root folder and monitoring settings for this series.";
}

export function SonarrSetupPane({
	formId,
	formState,
	isConfigured,
	formOptions,
	mode,
	portalContainer,
	setupMutationsBlocked,
	verificationFailed,
	verificationSettled,
	hasExistingItem,
}: SonarrSetupPaneProps): React.JSX.Element {
	const statusNotice = getSonarrSetupStatusNotice({
		verificationFailed,
		verificationSettled,
		mode,
		hasExistingItem,
	});
	const panel = (
		<BaseProviderSetupPanel
			providerName="Sonarr"
			isConfigured={isConfigured}
			hasFormOptions={!!formOptions}
			statusNotice={statusNotice}
			headerDescription={getHeaderDescription(mode)}
		>
			{formState && formOptions ? (
				mode === "edit" ? (
					<SonarrEditOptionsFields
						values={formState.currentDraft}
						monitoringAction={formState.monitoringAction}
						onChange={formState.handleFieldChange}
						onMonitoringActionChange={formState.handleMonitoringActionChange}
						disabled={formState.isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formOptions={formOptions}
						pathPreview={formState.pathPreview}
						layout="stacked"
					/>
				) : (
					<SonarrAddOptionsFields
						values={formState.currentDraft}
						onChange={formState.handleFieldChange}
						disabled={formState.isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formOptions={formOptions}
						pathPreview={formState.pathPreview}
						layout="stacked"
						includeSearchToggle={true}
					/>
				)
			) : null}
		</BaseProviderSetupPanel>
	);

	if (!formState) {
		return panel;
	}

	return (
		<form
			id={formId}
			onSubmit={(event) => void formState.handleSubmit(event)}
			className="h-full flex flex-col min-h-0"
		>
			{panel}
		</form>
	);
}
