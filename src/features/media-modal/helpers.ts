/** Owns small media-modal formatting helpers for mapping inspection UI. */
// src/features/media-modal/helpers.ts

import type {
	MappingInspectionCandidate,
	MappingInspectionSuggestedCandidates,
} from "@/mapping/inspection/inspection-types";

type SuggestedCandidateTone =
	| "muted"
	| "success"
	| "warning"
	| "info"
	| "accent"
	| "blue"
	| "default";

export function formatToken(value: string): string {
	return value.replaceAll("-", " ").replaceAll("_", " ");
}

export type SuggestedCandidateGroupKey =
	| "accepted"
	| "rejected"
	| "suppressed"
	| "notAccepted";

export type SuggestedCandidateGroup = {
	key: SuggestedCandidateGroupKey;
	label: string;
	tone: SuggestedCandidateTone;
	items: readonly MappingInspectionCandidate[];
	getRowLabel?: (candidate: MappingInspectionCandidate) => string;
};

function hasItems(
	items: readonly MappingInspectionCandidate[] | undefined,
): items is readonly MappingInspectionCandidate[] {
	return Array.isArray(items) && items.length > 0;
}

export function getSuggestedCandidateGroups(
	suggestedCandidates: MappingInspectionSuggestedCandidates,
): SuggestedCandidateGroup[] {
	const groups: SuggestedCandidateGroup[] = [];

	if (hasItems(suggestedCandidates.accepted)) {
		groups.push({
			key: "accepted",
			label: "Accepted",
			tone: "success",
			items: suggestedCandidates.accepted,
			getRowLabel: () => "Accepted",
		});
	}

	if (hasItems(suggestedCandidates.rejected)) {
		groups.push({
			key: "rejected",
			label: "Rejected",
			tone: "warning",
			items: suggestedCandidates.rejected,
			getRowLabel: () => "Rejected",
		});
	}

	if (hasItems(suggestedCandidates.suppressed)) {
		groups.push({
			key: "suppressed",
			label: "Suppressed",
			tone: "muted",
			items: suggestedCandidates.suppressed,
			getRowLabel: () => "Suppressed",
		});
	}

	if (hasItems(suggestedCandidates.notAccepted)) {
		groups.push({
			key: "notAccepted",
			label: "Not accepted",
			tone: "default",
			items: suggestedCandidates.notAccepted,
			getRowLabel: () => "Not accepted",
		});
	}

	return groups;
}
