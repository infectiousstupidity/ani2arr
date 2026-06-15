/** Shared Seerr request button and card action state derivation. */
// src/features/seerr-request/seerr-action-state.ts

import type { MediaActionState } from "@/features/media-action/state";
import type { SeerrMediaStatus } from "@/providers/seerr/types";

export type SeerrActionStatus = SeerrMediaStatus | undefined;

export interface SeerrActionStateInput {
	isConfigured: boolean;
	isRequesting: boolean;
	isChecking: boolean;
	requestSucceeded: boolean;
	requestFailed: boolean;
	status: SeerrActionStatus;
}

export interface SeerrActionState {
	state: Extract<
		MediaActionState,
		"unconfigured" | "checking" | "adding" | "in-library" | "error" | "can-add"
	>;
	label: string;
	disabled: boolean;
	settled: boolean;
}

export function isSettledSeerrStatus(status: SeerrActionStatus): boolean {
	const settled: string[] = ["available", "pending", "processing", "partial"];

	return status != null && settled.includes(status);
}

function getSettledLabel(status: SeerrActionStatus): string {
	if (status === "available") return "In Seerr library";
	if (status === "partial") return "Partially in Seerr library";
	return "Requested in Seerr";
}

export function getSeerrActionState(
	input: SeerrActionStateInput,
): SeerrActionState {
	if (!input.isConfigured) {
		return {
			state: "unconfigured",
			label: "Configure Seerr",
			disabled: false,
			settled: false,
		};
	}

	if (input.isRequesting) {
		return {
			state: "adding",
			label: "Requesting...",
			disabled: true,
			settled: false,
		};
	}

	if (input.isChecking) {
		return {
			state: "checking",
			label: "Checking Seerr...",
			disabled: true,
			settled: false,
		};
	}

	if (input.status === "deleted-or-blocked") {
		return {
			state: "error",
			label: "Unavailable in Seerr",
			disabled: true,
			settled: true,
		};
	}

	if (input.status === "deleted") {
		return {
			state: "can-add",
			label: "Request again in Seerr",
			disabled: false,
			settled: false,
		};
	}

	if (input.requestSucceeded || isSettledSeerrStatus(input.status)) {
		return {
			state: "in-library",
			label: getSettledLabel(input.status),
			disabled: true,
			settled: true,
		};
	}

	if (input.requestFailed) {
		return {
			state: "error",
			label: "Retry Seerr request",
			disabled: false,
			settled: false,
		};
	}

	return {
		state: "can-add",
		label: "Request in Seerr",
		disabled: false,
		settled: false,
	};
}
