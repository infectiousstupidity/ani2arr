/** Primary action tooltip text for browse-card overlays. */
// src/features/media-overlay/card-primary-title.ts

import type { MediaActionState } from "@/features/media-action/state";

interface CardPrimaryTitleInput {
	providerLabel: string;
	state: MediaActionState;
	errorSource: "status" | "add" | null;
	canQuickAdd: boolean;
}

export function getCardPrimaryTitle(input: CardPrimaryTitleInput): string {
	switch (input.state) {
		case "unconfigured": {
			return `Configure ${input.providerLabel} before adding`;
		}
		case "checking": {
			return `Checking ${input.providerLabel} status.`;
		}
		case "adding": {
			return `Adding to ${input.providerLabel}.`;
		}
		case "error": {
			return input.errorSource === "add"
				? `Retry ${input.providerLabel} add`
				: `Retry ${input.providerLabel} status check`;
		}
		case "unmapped":
		case "unknown": {
			return `Find ${input.providerLabel} match manually`;
		}
		case "in-library": {
			return `Already in ${input.providerLabel}`;
		}
		case "can-add": {
			return input.canQuickAdd
				? `Quick add to ${input.providerLabel}`
				: `${input.providerLabel} defaults unavailable`;
		}
	}
}

export function getCardPrimaryLabel(input: CardPrimaryTitleInput): string {
	switch (input.state) {
		case "unconfigured": {
			return `Configure ${input.providerLabel}`;
		}
		case "checking": {
			return `Checking ${input.providerLabel}...`;
		}
		case "adding": {
			return "Adding...";
		}
		case "error": {
			return input.errorSource === "add" ? "Retry add" : "Retry check";
		}
		case "unmapped":
		case "unknown": {
			return "Find match";
		}
		case "in-library": {
			return `In ${input.providerLabel}`;
		}
		case "can-add": {
			return `Add to ${input.providerLabel}`;
		}
	}
}
