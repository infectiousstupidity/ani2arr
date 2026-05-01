import type { AniListId } from "@/anilist";
import type { Provider, ProviderId } from "@/providers";
import type {
	AcceptedMappingEvidence,
	AcceptedMappingReason,
	AcceptedMappingSource,
	EffectiveMappingKind,
	EffectiveMappingState,
	MappingSuppressionKind,
	MappingUnknownReason,
} from "@/mapping/types";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";

export interface EffectiveMapping {
	anilistId: AniListId;
	provider: Provider;
	providerId: ProviderId | null;
	providerMappingState: EffectiveMappingState;
	mappingEntryKind: EffectiveMappingKind;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	acceptedEvidence?: AcceptedMappingEvidence;
	recentEvaluation?: AutoMappingRecord["recentEvaluation"];
	suppressedProviderId?: ProviderId | null;
	suppressionKind?: MappingSuppressionKind;
	exactUpstreamMatchProviderId?: ProviderId | null;
	autoMappingStatus?: AutoMappingRecord["state"];
	mappingUnknownReason?: MappingUnknownReason;
	hadResolveAttempt?: boolean;
}

interface BuildEffectiveMappingInput {
	provider: Provider;
	anilistId: AniListId;
	manualProviderId: ProviderId | null;
	ignored: boolean;
	upstreamProviderIds: readonly ProviderId[];
	rejectedCandidateProviderId?: ProviderId | null;
	autoMappingRecord: AutoMappingRecord | null;
}

const withRejectedSuppression = (
	effectiveMapping: EffectiveMapping,
	rejectedCandidateProviderId: ProviderId | null | undefined,
): EffectiveMapping =>
	rejectedCandidateProviderId == null
		? effectiveMapping
		: {
				...effectiveMapping,
				suppressedProviderId: rejectedCandidateProviderId,
				suppressionKind:
					effectiveMapping.suppressionKind ?? "rejected-candidate",
			};

const shouldApplyRejectedSuppression = (
	effectiveMapping: EffectiveMapping,
): boolean =>
	effectiveMapping.mappingEntryKind !== "manual" &&
	effectiveMapping.mappingEntryKind !== "upstream";

const buildManualEffectiveMapping = (
	input: BuildEffectiveMappingInput,
	upstreamProviderId: ProviderId | null,
): EffectiveMapping | null => {
	const { provider, anilistId, manualProviderId, autoMappingRecord } = input;
	if (manualProviderId === null) {
		return null;
	}

	if (upstreamProviderId !== null && upstreamProviderId === manualProviderId) {
		return {
			provider,
			anilistId,
			providerId: manualProviderId,
			providerMappingState: "mapped",
			mappingEntryKind: "upstream",
			mappingSource: "upstream",
			mappingReason: "exact-upstream",
			acceptedEvidence: {
				source: "upstream",
				reason: "exact-upstream",
			},
			...(autoMappingRecord?.state === "mapped" &&
			autoMappingRecord.recentEvaluation
				? { recentEvaluation: autoMappingRecord.recentEvaluation }
				: {}),
			autoMappingStatus: "mapped",
			hadResolveAttempt: true,
		};
	}

	return {
		provider,
		anilistId,
		providerId: manualProviderId,
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
		rejectedCandidateProviderId,
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
			...(autoMappingRecord?.state === "mapped" &&
			autoMappingRecord.recentEvaluation
				? { recentEvaluation: autoMappingRecord.recentEvaluation }
				: {}),
			autoMappingStatus: "mapped",
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
			...(autoMappingRecord.recentEvaluation
				? { recentEvaluation: autoMappingRecord.recentEvaluation }
				: {}),
			autoMappingStatus: "mapped",
			hadResolveAttempt: autoMappingRecord.acceptedEvidence.source === "auto",
		};
	}

	if (rejectedCandidateProviderId != null) {
		return {
			provider,
			anilistId,
			providerId: null,
			providerMappingState: "unmapped",
			mappingEntryKind: "rejected",
			hadResolveAttempt: true,
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
			...(autoMappingRecord.recentEvaluation
				? { recentEvaluation: autoMappingRecord.recentEvaluation }
				: {}),
			autoMappingStatus: autoMappingRecord.state,
			...(mappingUnknownReason ? { mappingUnknownReason } : {}),
			hadResolveAttempt: true,
		};
	}

	return {
		provider,
		anilistId,
		providerId: null,
		providerMappingState: "unmapped",
		mappingEntryKind: "unmapped",
		hadResolveAttempt: false,
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
		input.rejectedCandidateProviderId,
	);
}
