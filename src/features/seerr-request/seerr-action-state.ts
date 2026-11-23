/** Shared Seerr request button and card action state derivation. */
// src/features/seerr-request/seerr-action-state.ts

import type { MediaActionState } from "@/features/media-action/state";
import type {
	SeerrMediaStatus,
	SeerrStatusSummary,
} from "@/providers/seerr/types";

export type SeerrActionStatus = SeerrMediaStatus | undefined;

export interface SeerrActionStateInput {
	isConfigured: boolean;
	isChecking: boolean;
	hasUsableTarget: boolean;
	status: SeerrActionStatus;
}

export interface SeerrActionState {
	state: Extract<
		MediaActionState,
		"unconfigured" | "checking" | "in-library" | "error" | "can-add"
	>;
	label: string;
	disabled: boolean;
}

export function getSeerrVisualStatus(
	summary: SeerrStatusSummary | undefined,
): SeerrMediaStatus | undefined {
	if (!summary) return undefined;

	if (summary.target === "available") return "available";

	if (
		["pending", "processing", "deleted-or-blocked"].includes(summary.target)
	) {
		return summary.target;
	}

	if (summary.target === "partial" || summary.overall === "partial") {
		return "partial";
	}

	return summary.target;
}

function isSettledSeerrStatus(status: SeerrActionStatus): boolean {
	const settled: string[] = ["available", "pending", "processing", "partial"];

	return status != null && settled.includes(status);
}

function getSettledLabel(status: SeerrActionStatus): string {
	if (status === "available") return "Available in Seerr";
	if (status === "partial") return "Partially in Seerr";
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
		};
	}

	if (input.isChecking) {
		return {
			state: "checking",
			label: "Checking Seerr...",
			disabled: true,
		};
	}

	if (!input.hasUsableTarget) {
		return {
			state: "can-add",
			label: "Choose Seerr target",
			disabled: false,
		};
	}

	if (input.status === "deleted-or-blocked") {
		return {
			state: "error",
			label: "Unavailable in Seerr",
			disabled: true,
		};
	}

	if (input.status === "deleted") {
		return {
			state: "can-add",
			label: "Request again in Seerr",
			disabled: false,
		};
	}

	if (isSettledSeerrStatus(input.status)) {
		return {
			state: "in-library",
			label: getSettledLabel(input.status),
			disabled: false,
		};
	}

	return {
		state: "can-add",
		label: "Request in Seerr",
		disabled: false,
	};
}
