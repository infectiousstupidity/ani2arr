/** Derives the UI status for one mapping row. */
// src/mapping/queries/mapping-row-status.ts

import type {
	EffectiveMappingKind,
	EffectiveMappingState,
	ProviderExternalId,
} from "@/mapping/types";

export type MappingListRowStatus =
	| "mapped"
	| "unmapped"
	| "ignored"
	| "needs-review"
	| "unknown";

export function getMappingRowStatus(input: {
	providerId: ProviderExternalId | null;
	providerMappingState: EffectiveMappingState;
	mappingEntryKind: EffectiveMappingKind;
	isInLibrary: boolean | null;
}): MappingListRowStatus {
	if (input.mappingEntryKind === "ignored") {
		return "ignored";
	}

	if (
		input.mappingEntryKind === "rejected" ||
		input.providerMappingState === "unknown"
	) {
		return "needs-review";
	}

	if (input.providerId === null || input.isInLibrary === false) {
		return "unmapped";
	}

	if (input.isInLibrary === null) {
		return "unknown";
	}

	return "mapped";
}
