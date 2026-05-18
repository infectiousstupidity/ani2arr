/** Mapping row status derivation for options-page summaries and inspection payloads. */
// src/mapping/queries/mapping-row-status.ts

import type {
	EffectiveMappingState,
	MappingSuppressionKind,
} from "@/mapping/types";
import type { MappingIssuesSummary } from "./mapping-issues";

/** Primary user-facing status for one projected mapping summary row. */
export type MappingListRowStatus =
	| "needs-review"
	| "in-library"
	| "can-add"
	| "suppressed"
	| "unmapped"
	| "unknown";

export const deriveMappingRowStatus = (input: {
	reviewSummary?: MappingIssuesSummary;
	suppressionKind?: MappingSuppressionKind;
	providerMappingState: EffectiveMappingState;
	isInLibrary: boolean | null;
}): MappingListRowStatus => {
	if (input.reviewSummary) {
		return "needs-review";
	}
	if (input.suppressionKind) {
		return "suppressed";
	}
	if (input.providerMappingState === "unknown") {
		return "unknown";
	}
	if (input.providerMappingState === "unmapped") {
		return "unmapped";
	}
	if (input.isInLibrary === true) {
		return "in-library";
	}
	if (input.isInLibrary === false) {
		return "can-add";
	}
	return "unknown";
};
