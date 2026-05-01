/** Sonarr-only trusted relation inheritance and explicit inherited-candidate decisions. */
// src/mapping/auto-mapping/inheritance/verified-inheritance.ts

import {
	parseAniListIdOrNull,
	type AniListId,
	type AniListMediaService,
} from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import { sanitizeLookupDisplayForProvider } from "@/mapping/auto-mapping/title/title-normalization";
import type {
	ProviderCredentials,
	SonarrLookupSeries,
	TvdbId,
} from "@/providers";
import { createRecentEvaluationTrace } from "../recent-evaluation";
import type { AnibridgeMappingStore } from "../../upstream-mapping";
import type { ProviderTitleLookup } from "../lookup/provider-title-lookup";
import type { RecentMappingEvaluationTrace } from "../../types";
import type { AcceptedAutoMappingResult } from "../types";
import {
	verifyInheritedSonarrCandidate,
	type InheritedVerificationResult,
} from "./inherited-verifier";

const INHERITANCE_MAX_DEPTH = 5;
const RELATION_TYPES = new Set(["PREQUEL", "SEQUEL"]);

type TrustedAnchorSource = "manual" | "upstream";

type ManualMappingReads = {
	isIgnored(provider: "sonarr", anilistId: AniListId): boolean;
	get(provider: "sonarr", anilistId: AniListId): TvdbId | null;
};

type InheritedProposal = {
	providerId: TvdbId;
	anchorSource: TrustedAnchorSource;
	immediateSourceAniListId: AniListId;
	chainAnchorAniListId: AniListId;
	borrowedBaseTitle?: string;
};

type ExactSonarrLookupClient = ProviderTitleLookup<
	SonarrLookupSeries
>;

type InheritedTraceInput = {
	proposal: InheritedProposal;
	verification: InheritedVerificationResult;
	status: "accepted" | "not-accepted";
	summary: string;
};

type NearestProposalSearchInput = {
	media: AniListMedia;
	anilistApi: AniListMediaService;
	anibridgeMappingStore: AnibridgeMappingStore;
	manualMappings?: ManualMappingReads;
	maxDepth?: number;
};

export type InheritedResolutionAttempt =
	| {
			status: "none";
			recentEvaluation?: RecentMappingEvaluationTrace;
	  }
	| {
			status: "accepted";
			resolved: AcceptedAutoMappingResult;
			recentEvaluation?: RecentMappingEvaluationTrace;
	  }
	| {
			status: "rejected";
			borrowedBaseTitle?: string;
			recentEvaluation?: RecentMappingEvaluationTrace;
	  }
	| {
			status: "ambiguous" | "verification-failed";
			recentEvaluation?: RecentMappingEvaluationTrace;
	  };

function extractRelationIds(media: AniListMedia): AniListId[] {
	const ids = new Set<AniListId>();

	for (const edge of media.relations?.edges ?? []) {
		if (!edge || !RELATION_TYPES.has(edge.relationType)) {
			continue;
		}

		const anilistId = parseAniListIdOrNull(edge.node?.id);
		if (anilistId) {
			ids.add(anilistId);
		}
	}

	return [...ids];
}

function buildBorrowedBaseTitle(media: AniListMedia): string | undefined {
	const candidates = [
		media.title?.english,
		media.title?.romaji,
		media.title?.native,
		...(Array.isArray(media.synonyms) ? media.synonyms : []),
	];

	for (const candidate of candidates) {
		if (typeof candidate !== "string" || candidate.trim().length === 0) {
			continue;
		}
		const sanitized = sanitizeLookupDisplayForProvider("sonarr", candidate);
		if (sanitized) {
			return sanitized;
		}
	}

	return undefined;
}

function buildInheritedTrace({
	proposal,
	verification,
	status,
	summary,
}: InheritedTraceInput): RecentMappingEvaluationTrace | undefined {
	return createRecentEvaluationTrace(
		[],
		[
			{
				providerId: proposal.providerId,
				...(verification.title ? { title: verification.title } : {}),
				source: "auto",
				reason: "verified-inherited",
				status,
				summary,
				inheritedVerification: verification.details,
			},
		],
	);
}

function buildConflictTrace(
	proposals: readonly InheritedProposal[],
): RecentMappingEvaluationTrace | undefined {
	return createRecentEvaluationTrace(
		[],
		proposals.map((proposal) => ({
			providerId: proposal.providerId,
			...(proposal.borrowedBaseTitle
				? { title: proposal.borrowedBaseTitle }
				: {}),
			source: "auto",
			reason: "verified-inherited",
			status: "not-accepted",
			summary:
				"Inherited candidate ambiguous: conflicting trusted relation anchors proposed different provider IDs.",
			inheritedVerification: {
				verdict: "ambiguous",
				reason:
					"Conflicting trusted relation anchors proposed different provider IDs.",
				positiveSignals: [],
				contradictions: [],
				immediateSourceAniListId: proposal.immediateSourceAniListId,
				chainAnchorAniListId: proposal.chainAnchorAniListId,
			},
		})),
	);
}

function selectTrustedAnchor(
	anilistId: AniListId,
	anibridgeMappingStore: AnibridgeMappingStore,
	manualMappings?: ManualMappingReads,
): { providerId: TvdbId; source: TrustedAnchorSource } | null {
	if (manualMappings?.isIgnored("sonarr", anilistId)) {
		return null;
	}

	const manualProviderId = manualMappings?.get("sonarr", anilistId) ?? null;
	if (manualProviderId !== null) {
		return { providerId: manualProviderId, source: "manual" };
	}

	const anibridgeProviderIds =
		anibridgeMappingStore.getSonarrCandidates(anilistId);
	if (anibridgeProviderIds.length === 1) {
		return { providerId: anibridgeProviderIds[0]!, source: "upstream" };
	}

	return null;
}

async function collectNearestProposals({
	media,
	anilistApi,
	anibridgeMappingStore,
	manualMappings,
	maxDepth = INHERITANCE_MAX_DEPTH,
}: NearestProposalSearchInput): Promise<InheritedProposal[]> {
	const visited = new Set<AniListId>([media.id]);
	let frontier: Array<{ media: AniListMedia; firstHopAniListId?: AniListId }> =
		[{ media }];

	for (let depth = 1; depth <= maxDepth; depth += 1) {
		const nextFrontier: Array<{
			media: AniListMedia;
			firstHopAniListId?: AniListId;
		}> = [];
		const proposals: InheritedProposal[] = [];

		for (const entry of frontier) {
			for (const relatedId of extractRelationIds(entry.media)) {
				if (visited.has(relatedId)) {
					continue;
				}

				visited.add(relatedId);
				const relatedMedia = await anilistApi.fetchMediaWithRelations(
					relatedId,
					{
						source: "verified-inheritance",
					},
				);
				const firstHopAniListId = entry.firstHopAniListId ?? relatedMedia.id;
				const anchor = selectTrustedAnchor(
					relatedMedia.id,
					anibridgeMappingStore,
					manualMappings,
				);
				if (anchor) {
					const borrowedBaseTitle = buildBorrowedBaseTitle(relatedMedia);
					proposals.push({
						providerId: anchor.providerId,
						anchorSource: anchor.source,
						immediateSourceAniListId: firstHopAniListId,
						chainAnchorAniListId: relatedMedia.id,
						...(borrowedBaseTitle ? { borrowedBaseTitle } : {}),
					});
				}
				nextFrontier.push({ media: relatedMedia, firstHopAniListId });
			}
		}

		if (proposals.length > 0) {
			return proposals;
		}

		frontier = nextFrontier;
		if (frontier.length === 0) {
			break;
		}
	}

	return [];
}

export async function attemptVerifiedInheritedSonarrResolution(input: {
	media: AniListMedia;
	anilistApi: AniListMediaService;
	anibridgeMappingStore: AnibridgeMappingStore;
	manualMappings?: ManualMappingReads;
	lookupClient: ExactSonarrLookupClient;
	credentials: ProviderCredentials;
	maxDepth?: number;
}): Promise<InheritedResolutionAttempt> {
	const proposals = await collectNearestProposals({
		media: input.media,
		anilistApi: input.anilistApi,
		anibridgeMappingStore: input.anibridgeMappingStore,
		...(input.manualMappings ? { manualMappings: input.manualMappings } : {}),
		...(input.maxDepth === undefined ? {} : { maxDepth: input.maxDepth }),
	});
	if (proposals.length === 0) {
		return { status: "none" };
	}

	const uniqueProviderIds = new Set(
		proposals.map((proposal) => proposal.providerId),
	);
	if (uniqueProviderIds.size > 1) {
		const conflictTrace = buildConflictTrace(proposals);
		return {
			status: "ambiguous",
			...(conflictTrace ? { recentEvaluation: conflictTrace } : {}),
		};
	}

	const proposal =
		proposals.find((candidate) => candidate.anchorSource === "manual") ??
		proposals[0]!;
	const verification = await verifyInheritedSonarrCandidate(
		input.media,
		proposal,
		input.lookupClient,
		input.credentials,
	);

	const acceptedTrace = buildInheritedTrace({
		proposal,
		verification,
		status: "accepted",
		summary: "Inherited candidate accepted after exact Sonarr verification.",
	});
	if (verification.verdict === "accept") {
		const resolved: AcceptedAutoMappingResult = {
			providerId: proposal.providerId,
			reason: "verified-inherited",
			immediateSourceAniListId: proposal.immediateSourceAniListId,
			chainAnchorAniListId: proposal.chainAnchorAniListId,
			inheritedVerification: verification.details,
			...(verification.title ? { successfulSynonym: verification.title } : {}),
		};
		return {
			status: "accepted",
			resolved,
			...(acceptedTrace ? { recentEvaluation: acceptedTrace } : {}),
		};
	}

	if (verification.verdict === "reject") {
		const rejectedTrace = buildInheritedTrace({
			proposal,
			verification,
			status: "not-accepted",
			summary: `Inherited candidate rejected: ${verification.details.reason}`,
		});
		return {
			status: "rejected",
			...(proposal.borrowedBaseTitle
				? { borrowedBaseTitle: proposal.borrowedBaseTitle }
				: {}),
			...(rejectedTrace ? { recentEvaluation: rejectedTrace } : {}),
		};
	}

	if (verification.verdict === "ambiguous") {
		const ambiguousTrace = buildInheritedTrace({
			proposal,
			verification,
			status: "not-accepted",
			summary: `Inherited candidate ambiguous: ${verification.details.reason}`,
		});
		return {
			status: "ambiguous",
			...(ambiguousTrace ? { recentEvaluation: ambiguousTrace } : {}),
		};
	}

	const failedTrace = buildInheritedTrace({
		proposal,
		verification,
		status: "not-accepted",
		summary: `Inherited candidate could not be verified: ${verification.details.reason}`,
	});
	return {
		status: "verification-failed",
		...(failedTrace ? { recentEvaluation: failedTrace } : {}),
	};
}
