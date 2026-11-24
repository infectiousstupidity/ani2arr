/** Shared arr action wording for browse cards and anime pages. A trailing "…" means the click needs more input or is in progress. */
// src/features/media-action/labels.ts

import type { MediaActionState } from "./state";

interface ArrPrimaryLabelInput {
	providerLabel: string;
	state: MediaActionState;
	errorSource: "status" | "add" | null;
	canQuickAdd: boolean;
}

export function getArrPrimaryLabel(input: ArrPrimaryLabelInput): string {
	const { providerLabel } = input;

	switch (input.state) {
		case "unconfigured": {
			return `Configure ${providerLabel}…`;
		}
		case "checking": {
			return `Checking ${providerLabel}…`;
		}
		case "adding": {
			return `Adding to ${providerLabel}…`;
		}
		case "error": {
			return input.errorSource === "add" ? "Retry add" : "Retry check";
		}
		case "unmapped":
		case "unknown": {
			return "Find match…";
		}
		case "in-library": {
			return `In ${providerLabel}`;
		}
		case "can-add": {
			return input.canQuickAdd
				? `Add to ${providerLabel}`
				: `Add to ${providerLabel}…`;
		}
	}
}

/** Extra context for the primary button; undefined when it would only restate the label. */
export function getArrPrimaryTooltip(
	input: ArrPrimaryLabelInput,
): string | undefined {
	const { providerLabel } = input;

	switch (input.state) {
		case "unconfigured":
		case "checking":
		case "adding": {
			return undefined;
		}
		case "error": {
			return input.errorSource === "add"
				? `Unable to add this title to ${providerLabel}. Retry the add.`
				: `Unable to determine ${providerLabel} status right now. Retry the check.`;
		}
		case "unmapped": {
			return `No automatic ${providerLabel} match was found. Find a match to continue.`;
		}
		case "unknown": {
			return `Unable to determine ${providerLabel} status right now. Find a match to continue.`;
		}
		case "in-library": {
			return getArrSetupLabel(providerLabel);
		}
		case "can-add": {
			return input.canQuickAdd
				? `Adds with your default ${providerLabel} settings.`
				: `No default ${providerLabel} settings are available. Choose options before adding.`;
		}
	}
}

export function getArrSetupLabel(providerLabel: string): string {
	return `${providerLabel} options…`;
}

export function getArrMappingLabel(hasMapping: boolean): string {
	return hasMapping ? "Change match…" : "Find match…";
}

export function getOpenProviderLabel(providerLabel: string): string {
	return `Open in ${providerLabel}`;
}
