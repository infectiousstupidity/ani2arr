/** Renders Radarr setup content for the media modal left pane. */
// src/features/media-modal/components/setup/radarr-setup-pane.tsx

import type { ComponentProps } from "react";
import { RadarrAddOptionsFields } from "@/components/provider-add-options/radarr-add-options-fields";
import { BaseProviderSetupPanel } from "./provider-setup-panel";
import type { RadarrSetupFormState } from "../../hooks/radarr/use-radarr-setup-form";

type RadarrProviderMetadata = ComponentProps<
	typeof RadarrAddOptionsFields
>["metadata"];
type RadarrPortalContainer = ComponentProps<
	typeof RadarrAddOptionsFields
>["portalContainer"];

interface RadarrSetupPaneProps {
	formId: string;
	formState: RadarrSetupFormState | null;
	isConfigured: boolean;
	metadata: RadarrProviderMetadata | null;
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
	metadata,
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
			hasMetadata={!!metadata}
			statusNotice={statusNotice}
			headerDescription={getHeaderDescription(mode)}
		>
			{formState && metadata ? (
				<RadarrAddOptionsFields
					values={formState.currentDraft}
					onChange={formState.handleFieldChange}
					disabled={formState.isBusy || setupMutationsBlocked}
					portalContainer={portalContainer}
					metadata={metadata}
					pathPreview={formState.pathPreview}
					layout="stacked"
				/>
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
