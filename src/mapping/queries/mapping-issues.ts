/** Projects review-worthy mapping conflicts from effective state and resolver traces. */
// src/mapping/queries/mapping-issues.ts

import type { ProviderId } from "@/providers";
import type {
	AcceptedMappingEvidence,
	AcceptedMappingReason,
	EffectiveMappingKind,
} from "@/mapping/types";
import type { AutoMappingStatus } from "@/mapping/auto-mapping/types";

export type MappingIssueReason =
	| "manual-upstream-disagreement"
	| "ignored-but-exact-upstream";

export type MappingIssueAction =
	| "keep-current"
	| "use-exact-upstream"
	| "clear-ignore";

type MappingIssueMappingSnapshot = {
	mappingEntryKind: EffectiveMappingKind;
	providerId: ProviderId | null;
	autoMappingStatus?: AutoMappingStatus;
	acceptedReason?: AcceptedMappingReason;
};

export interface MappingIssue {
	reason: MappingIssueReason;
	summary: string;
	current: MappingIssueMappingSnapshot;
	proposed?: MappingIssueMappingSnapshot;
	conflicts?: readonly MappingIssueMappingSnapshot[];
	actions: readonly MappingIssueAction[];
}

export interface MappingIssuesSummary {
	count: number;
	primaryReason: MappingIssueReason;
	reasons: readonly MappingIssueReason[];
}

const buildReviewState = (input: {
	mappingEntryKind: MappingIssueMappingSnapshot["mappingEntryKind"];
	providerId: ProviderId | null;
	autoMappingStatus?:
		| MappingIssueMappingSnapshot["autoMappingStatus"]
		| undefined;
	acceptedReason?: MappingIssueMappingSnapshot["acceptedReason"] | undefined;
}): MappingIssueMappingSnapshot => ({
	mappingEntryKind: input.mappingEntryKind,
	providerId: input.providerId,
	...(input.autoMappingStatus
		? { autoMappingStatus: input.autoMappingStatus }
		: {}),
	...(input.acceptedReason ? { acceptedReason: input.acceptedReason } : {}),
});

const buildSummary = (
	reviewItems: readonly MappingIssue[],
): MappingIssuesSummary | undefined => {
	if (reviewItems.length === 0) {
		return undefined;
	}

	const reasons: MappingIssuesSummary["reasons"] = [
		...new Set(reviewItems.map((item) => item.reason)),
	];
	return {
		count: reviewItems.length,
		primaryReason: reviewItems[0]!.reason,
		reasons,
	};
};

export function projectMappingIssues(input: {
	mappingEntryKind: EffectiveMappingKind;
	providerId: ProviderId | null;
	acceptedEvidence?: AcceptedMappingEvidence;
	autoMappingStatus?: AutoMappingStatus;
	exactUpstreamMatchProviderId?: ProviderId | null;
}): {
	reviewSummary?: MappingIssuesSummary;
	reviewItems?: readonly MappingIssue[];
} {
	const current = buildReviewState({
		mappingEntryKind: input.mappingEntryKind,
		providerId: input.providerId,
		autoMappingStatus: input.autoMappingStatus,
		acceptedReason: input.acceptedEvidence?.reason,
	});
	const reviewItems: MappingIssue[] = [];

	if (
		input.mappingEntryKind === "manual" &&
		input.providerId !== null &&
		typeof input.exactUpstreamMatchProviderId === "number" &&
		input.exactUpstreamMatchProviderId !== input.providerId
	) {
		reviewItems.push({
			reason: "manual-upstream-disagreement",
			summary: "Manual mapping disagrees with exact upstream mapping.",
			current,
			proposed: buildReviewState({
				mappingEntryKind: "upstream",
				providerId: input.exactUpstreamMatchProviderId,
				autoMappingStatus: "mapped",
				acceptedReason: "exact-upstream",
			}),
			actions: ["keep-current", "use-exact-upstream"],
		});
	}

	if (
		input.mappingEntryKind === "ignored" &&
		typeof input.exactUpstreamMatchProviderId === "number"
	) {
		reviewItems.push({
			reason: "ignored-but-exact-upstream",
			summary: "Ignored title now has an exact upstream mapping available.",
			current,
			proposed: buildReviewState({
				mappingEntryKind: "upstream",
				providerId: input.exactUpstreamMatchProviderId,
				autoMappingStatus: "mapped",
				acceptedReason: "exact-upstream",
			}),
			actions: ["keep-current", "clear-ignore"],
		});
	}

	const reviewSummary = buildSummary(reviewItems);
	return reviewSummary
		? {
				reviewSummary,
				reviewItems,
			}
		: {};
}
