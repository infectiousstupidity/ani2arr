/** Shared media-action state derivation for AniList browse and anime-page surfaces. */
// src/features/media-action/state.ts

import type { MappingResult } from "@/mapping/types";

export type MediaActionState =
	| "unconfigured"
	| "checking"
	| "adding"
	| "error"
	| "unmapped"
	| "unknown"
	| "in-library"
	| "can-add";

export type MediaActionCommand =
	| "configure"
	| "quick-add"
	| "open-mapping"
	| "retry-status"
	| "retry-add"
	| "none";

export interface MediaActionStatus {
	state: MediaActionState;
	action: MediaActionCommand;
	errorSource: "status" | "add" | null;
	hasMapping: boolean;
	disabled: boolean;
}

export function getMediaActionStatus(input: {
	isConfigured: boolean;
	isChecking: boolean;
	isAdding: boolean;
	hasAddError: boolean;
	hasStatusError: boolean;
	addSucceeded: boolean;
	mapping: MappingResult | null | undefined;
	isInLibrary: boolean | null;
	hasProviderId: boolean;
	canQuickAdd: boolean;
}): MediaActionStatus {
	const hasMapping =
		input.hasProviderId || input.addSucceeded || input.isInLibrary === true;

	if (input.isChecking) {
		return {
			state: "checking",
			action: "none",
			errorSource: null,
			hasMapping,
			disabled: true,
		};
	}

	if (!input.isConfigured) {
		return {
			state: "unconfigured",
			action: "configure",
			errorSource: null,
			hasMapping: false,
			disabled: false,
		};
	}

	if (input.isAdding) {
		return {
			state: "adding",
			action: "none",
			errorSource: null,
			hasMapping,
			disabled: true,
		};
	}

	if (input.hasAddError) {
		return {
			state: "error",
			action: "retry-add",
			errorSource: "add",
			hasMapping,
			disabled: false,
		};
	}

	if (input.hasStatusError) {
		return {
			state: "error",
			action: "retry-status",
			errorSource: "status",
			hasMapping,
			disabled: false,
		};
	}

	if (input.addSucceeded || input.isInLibrary === true) {
		return {
			state: "in-library",
			action: "none",
			errorSource: null,
			hasMapping,
			disabled: true,
		};
	}

	if (input.mapping?.kind === "unmapped") {
		return {
			state: "unmapped",
			action: "open-mapping",
			errorSource: null,
			hasMapping,
			disabled: false,
		};
	}

	if (
		input.mapping?.kind !== "mapped" ||
		input.isInLibrary !== false ||
		!input.hasProviderId
	) {
		return {
			state: "unknown",
			action: "open-mapping",
			errorSource: null,
			hasMapping,
			disabled: false,
		};
	}

	return {
		state: "can-add",
		action: "quick-add",
		errorSource: null,
		hasMapping,
		disabled: !input.canQuickAdd,
	};
}
