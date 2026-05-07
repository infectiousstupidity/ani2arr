/** Renders Radarr setup content for the media modal left pane. */
// src/features/media-modal/components/setup/radarr-setup-pane.tsx

import type { ComponentProps } from "react";
import { RadarrAddOptionsFields } from "@/features/provider-setup/radarr-add-options-fields";
import { RadarrEditOptionsFields } from "@/features/provider-setup/radarr-edit-options-fields";
import { BaseProviderSetupPanel } from "./provider-setup-panel";
import type { RadarrSetupFormState } from "../../hooks/radarr/use-radarr-setup-form";

type RadarrProviderFormOptions = ComponentProps<
	typeof RadarrAddOptionsFields
>["formOptions"];
type RadarrPortalContainer = ComponentProps<
	typeof RadarrAddOptionsFields
>["portalContainer"];

interface RadarrSetupPaneProps {
	formId: string;
	formState: RadarrSetupFormState | null;
	isConfigured: boolean;
	formOptions: RadarrProviderFormOptions | null;
	mode: "add" | "edit";
	portalContainer: RadarrPortalContainer;
	setupMutationsBlocked: boolean;
	verificationFailed: boolean;
	verificationSettled: boolean;
	hasExistingItem: boolean;
}

function getRadarrSetupStatusNotice(input: {
	verificationFailed: boolean;
	verificationSettled: boolean;
	mode: "add" | "edit";
	hasExistingItem: boolean;
}): string | null {
	if (input.verificationFailed) {
		return "Unable to verify the current Radarr library status right now. Setup changes stay disabled until verification succeeds.";
	}

	if (!input.verificationSettled) {
		return input.mode === "edit"
			? "Verifying the current Radarr item before enabling edit actions."
			: "Verifying the current Radarr status before enabling setup changes.";
	}

	if (input.mode === "edit" && !input.hasExistingItem) {
		return "Refreshing Radarr item details before enabling edit actions.";
	}

	return null;
}

function getHeaderDescription(mode: "add" | "edit"): string {
	return mode === "edit"
		? "Update the folder and quality settings for this Radarr item."
		: "Choose the root folder and add options for this movie.";
}

export function RadarrSetupPane({
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
}: RadarrSetupPaneProps): React.JSX.Element {
	const statusNotice = getRadarrSetupStatusNotice({
		verificationFailed,
		verificationSettled,
		mode,
		hasExistingItem,
	});
	const panel = (
		<BaseProviderSetupPanel
			providerName="Radarr"
			isConfigured={isConfigured}
			hasFormOptions={!!formOptions}
			statusNotice={statusNotice}
			headerDescription={getHeaderDescription(mode)}
		>
			{formState && formOptions ? (
				mode === "edit" ? (
					<RadarrEditOptionsFields
						values={formState.currentDraft}
						onChange={formState.handleFieldChange}
						disabled={formState.isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formOptions={formOptions}
						pathPreview={formState.pathPreview}
						layout="stacked"
					/>
				) : (
					<RadarrAddOptionsFields
						values={formState.currentDraft}
						onChange={formState.handleFieldChange}
						disabled={formState.isBusy || setupMutationsBlocked}
						portalContainer={portalContainer}
						formOptions={formOptions}
						pathPreview={formState.pathPreview}
						layout="stacked"
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
