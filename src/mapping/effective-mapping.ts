/** Centralized effective mapping precedence, suppression, and timestamp resolution. */
// src/mapping/effective-mapping.ts

import type { AniListId } from "@/anilist";
import type { Provider } from "@/providers";
import type {
	AcceptedMappingEvidence,
	AcceptedMappingReason,
	AcceptedMappingSource,
	EffectiveMappingKind,
	EffectiveMappingState,
	MappingSuppressionKind,
	MappingUnknownReason,
	ProviderExternalId,
} from "@/mapping/types";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";

export interface EffectiveMapping {
	anilistId: AniListId;
	provider: Provider;
	providerId: ProviderExternalId | null;
	providerMappingState: EffectiveMappingState;
	mappingEntryKind: EffectiveMappingKind;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	acceptedEvidence?: AcceptedMappingEvidence;
	suppressedProviderId?: ProviderExternalId | null;
	suppressionKind?: MappingSuppressionKind;
	exactUpstreamMatchProviderId?: ProviderExternalId | null;
	autoMappingStatus?: AutoMappingRecord["state"];
	mappingUnknownReason?: MappingUnknownReason;
	hadResolveAttempt?: boolean;
	updatedAt: number;
}

export interface BuildEffectiveMappingInput {
	provider: Provider;
	anilistId: AniListId;
	manual: { providerId: ProviderExternalId; updatedAt: number } | null;
	ignored: { updatedAt: number } | null;
	upstreamProviderIds: readonly ProviderExternalId[];
	rejectedCandidate: {
		providerId: ProviderExternalId;
		updatedAt: number;
	} | null;
	autoMappingRecord: AutoMappingRecord | null;
}

const maxUpdatedAt = (...values: Array<number | undefined | null>): number => {
	let max = 0;
	for (const value of values) {
		if (typeof value === "number") {
			max = Math.max(max, value);
		}
	}
	return max;
};

const withRejectedSuppression = (
	effectiveMapping: EffectiveMapping,
	rejectedCandidate: { providerId: ProviderExternalId } | null,
): EffectiveMapping =>
	rejectedCandidate
		? {
				...effectiveMapping,
				suppressedProviderId: rejectedCandidate.providerId,
				suppressionKind:
					effectiveMapping.suppressionKind ?? "rejected-candidate",
			}
		: effectiveMapping;

const shouldApplyRejectedSuppression = (
	effectiveMapping: EffectiveMapping,
): boolean =>
	effectiveMapping.mappingEntryKind !== "manual" &&
	effectiveMapping.mappingEntryKind !== "upstream";

const buildManualEffectiveMapping = (
	input: BuildEffectiveMappingInput,
	upstreamProviderId: ProviderExternalId | null,
): EffectiveMapping | null => {
	const { provider, anilistId, manual, autoMappingRecord, rejectedCandidate } =
		input;
	if (!manual) {
		return null;
	}

	if (upstreamProviderId !== null && upstreamProviderId === manual.providerId) {
		return {
			provider,
			anilistId,
			providerId: manual.providerId,
			providerMappingState: "mapped",
			mappingEntryKind: "upstream",
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			acceptedEvidence: {
				source: "upstream",
				reason: "exact-upstream",
			},
			autoMappingStatus: "mapped",
			hadResolveAttempt: true,
			updatedAt: maxUpdatedAt(
				manual.updatedAt,
				autoMappingRecord?.state === "mapped" ? autoMappingRecord.updatedAt : 0,
				rejectedCandidate?.updatedAt,
			),
		};
	}

	return {
		provider,
		anilistId,
		providerId: manual.providerId,
		providerMappingState: "mapped",
		mappingEntryKind: "manual",
		mappingSource: "manual",
		mappingReason: "manual-override",
		acceptedEvidence: {
			source: "manual",
			reason: "manual-override",
		},
		autoMappingStatus: "mapped",
		exactUpstreamMatchProviderId: upstreamProviderId,
		hadResolveAttempt: true,
		updatedAt: maxUpdatedAt(manual.updatedAt, rejectedCandidate?.updatedAt),
	};
};

export const autoMappingStatusToUnknownReason = (
	autoMappingStatus: AutoMappingRecord["state"] | undefined,
): MappingUnknownReason | undefined => {
	switch (autoMappingStatus) {
		case "ambiguous": {
			return "ambiguous";
		}
		default: {
			return undefined;
		}
	}
};

const buildEffectiveMappingWithoutSuppression = (
	input: BuildEffectiveMappingInput,
): EffectiveMapping => {
	const {
		provider,
		anilistId,
		ignored,
		upstreamProviderIds,
		rejectedCandidate,
		autoMappingRecord,
	} = input;
	const upstreamProviderId =
		upstreamProviderIds.length === 1 ? upstreamProviderIds[0]! : null;
	const hasAmbiguousUpstream = upstreamProviderIds.length > 1;

	if (ignored) {
		return {
			provider,
			anilistId,
			providerId: null,
			providerMappingState: "unmapped",
			mappingEntryKind: "ignored",
			exactUpstreamMatchProviderId: upstreamProviderId,
			hadResolveAttempt: true,
			updatedAt: maxUpdatedAt(ignored.updatedAt, rejectedCandidate?.updatedAt),
		};
	}

	const manualEffectiveMapping = buildManualEffectiveMapping(
		input,
		upstreamProviderId,
	);
	if (manualEffectiveMapping) {
		return manualEffectiveMapping;
	}

	if (upstreamProviderId !== null) {
		return {
			provider,
			anilistId,
			providerId: upstreamProviderId,
			providerMappingState: "mapped",
			mappingEntryKind: "upstream",
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			acceptedEvidence: {
				source: "upstream",
				reason: "exact-upstream",
			},
			autoMappingStatus: "mapped",
			updatedAt: maxUpdatedAt(
				autoMappingRecord?.state === "mapped" ? autoMappingRecord.updatedAt : 0,
				rejectedCandidate?.updatedAt,
			),
		};
	}

	if (hasAmbiguousUpstream) {
		return {
			provider,
			anilistId,
			providerId: null,
			providerMappingState: "unknown",
			mappingEntryKind: "unknown",
			autoMappingStatus: "ambiguous",
			mappingUnknownReason: "ambiguous",
			hadResolveAttempt: true,
			updatedAt: maxUpdatedAt(
				autoMappingRecord?.updatedAt,
				rejectedCandidate?.updatedAt,
			),
		};
	}

	if (autoMappingRecord?.state === "mapped") {
		return {
			provider,
			anilistId,
			providerId: autoMappingRecord.providerId,
			providerMappingState: "mapped",
			mappingEntryKind: autoMappingRecord.acceptedEvidence.source,
			mappingSource: autoMappingRecord.acceptedEvidence.source,
			mappingReason: autoMappingRecord.acceptedEvidence.reason,
			acceptedEvidence: autoMappingRecord.acceptedEvidence,
			autoMappingStatus: "mapped",
			hadResolveAttempt: autoMappingRecord.acceptedEvidence.source === "auto",
			updatedAt: maxUpdatedAt(
				autoMappingRecord.updatedAt,
				rejectedCandidate?.updatedAt,
			),
		};
	}

	if (rejectedCandidate != null) {
		return {
			provider,
			anilistId,
			providerId: null,
			providerMappingState: "unmapped",
			mappingEntryKind: "rejected",
			hadResolveAttempt: true,
			updatedAt: rejectedCandidate.updatedAt,
		};
	}

	if (autoMappingRecord) {
		const mappingUnknownReason = autoMappingStatusToUnknownReason(
			autoMappingRecord.state,
		);
		return {
			provider,
			anilistId,
			providerId: null,
			providerMappingState: mappingUnknownReason ? "unknown" : "unmapped",
			mappingEntryKind: mappingUnknownReason ? "unknown" : "unmapped",
			autoMappingStatus: autoMappingRecord.state,
			...(mappingUnknownReason ? { mappingUnknownReason } : {}),
			hadResolveAttempt: true,
			updatedAt: autoMappingRecord.updatedAt,
		};
	}

	return {
		provider,
		anilistId,
		providerId: null,
		providerMappingState: "unmapped",
		mappingEntryKind: "unmapped",
		hadResolveAttempt: false,
		updatedAt: 0,
	};
};

export function buildEffectiveMapping(
	input: BuildEffectiveMappingInput,
): EffectiveMapping {
	const effectiveMapping = buildEffectiveMappingWithoutSuppression(input);
	const effectiveMappingWithSuppression: EffectiveMapping =
		effectiveMapping.mappingEntryKind === "ignored"
			? { ...effectiveMapping, suppressionKind: "ignored-entry" }
			: effectiveMapping;

	if (!shouldApplyRejectedSuppression(effectiveMapping)) {
		return effectiveMappingWithSuppression;
	}

	return withRejectedSuppression(
		effectiveMappingWithSuppression,
		input.rejectedCandidate,
	);
}
