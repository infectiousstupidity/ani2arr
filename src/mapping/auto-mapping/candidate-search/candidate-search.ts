/** Candidate search execution for provider lookups, scoring, and final selection. */
// src/mapping/auto-mapping/candidate-search/candidate-search.ts

import type { AniListMedia } from "@/anilist/schemas/media.schema";
import type { AcceptedMappingReason } from "@/mapping/types";
import type { Provider, ProviderCredentials, ProviderId } from "@/providers";
import type { ScopedLogger } from "@/shared/utils/logger";
import type { RequestPriority } from "@/shared/utils/request-priority";
import { PIPELINE_SOFT_TIME_BUDGET_MS } from "../constants";
import type {
	ProviderTitleLookup,
	ProviderTitleResult,
	TitleLookupOptions,
} from "../lookup/provider-title-lookup";
import {
	makeTitleSearchTerm,
	makeTitleSearchTerms,
	type TitleSearchTerm,
} from "../title/title-search";
import { scoreTitleMatches } from "../title/title-matching";

const TRACE_CANDIDATE_LIMIT = 8;
const MIN_WINNER_SCORE_MARGIN = 0.02;

type CandidateSearchContext = {
	lookupClient: ProviderTitleLookup<ProviderTitleResult>;
	credentials: ProviderCredentials;
	priority?: RequestPriority;
	forceLookupNetwork?: boolean;
	isCandidateSuppressed?: (
		providerId: ProviderId,
		reason: AcceptedMappingReason,
	) => boolean;
	limits: {
		maxTerms: number;
		scoreThreshold: number;
		earlyStopThreshold: number;
	};
	log: ScopedLogger;
};

export interface SearchedCandidate {
	providerId: ProviderId;
	title: string;
	reason: AcceptedMappingReason;
	score: number;
	searchTerm: string;
	status?: "rejected";
}

export type CandidateSearchOutcome =
	| {
			status: "resolved";
			providerId: ProviderId;
			reason: AcceptedMappingReason;
			confidence: number;
			successfulSynonym?: string;
			searchTerms: string[];
			candidates: SearchedCandidate[];
	  }
	| {
			status: "unresolved";
			reason: string;
			searchTerms: string[];
			candidates: SearchedCandidate[];
	  };

type ScoredTitleCandidate = ReturnType<typeof scoreTitleMatches>[number];
type ScoredSearchCandidate = ScoredTitleCandidate & {
	acceptedReason: AcceptedMappingReason;
};

type SearchTermEntry = {
	term: TitleSearchTerm;
	acceptedReasonOverride?: AcceptedMappingReason;
};

type EarlyStopLimits = {
	earlyStopThreshold: number;
	scoreThreshold: number;
};

function bestByProviderId(
	candidates: ScoredSearchCandidate[],
	lookupClient: ProviderTitleLookup<ProviderTitleResult>,
): ScoredSearchCandidate[] {
	const best = new Map<ProviderId, ScoredSearchCandidate>();

	for (const candidate of candidates) {
		const providerId = lookupClient.readProviderId(candidate.result);
		if (providerId === null) {
			continue;
		}
		const existing = best.get(providerId);
		if (!existing || candidate.score > existing.score) {
			best.set(providerId, candidate);
		}
	}

	return [...best.values()].toSorted((left, right) => right.score - left.score);
}

function pickEarlySearchResult(
	batch: ScoredSearchCandidate[],
	lookupClient: ProviderTitleLookup<ProviderTitleResult>,
	limits: EarlyStopLimits,
): { stop: boolean; pick?: ScoredSearchCandidate } {
	const providerWinners = bestByProviderId(batch, lookupClient);
	if (providerWinners.length === 0) return { stop: false };
	const top = providerWinners[0];
	const second = providerWinners[1];
	if (
		top &&
		top.score >= limits.earlyStopThreshold &&
		hasUniqueWinnerMargin(top, second)
	) {
		return { stop: true, pick: top };
	}
	if (
		top &&
		top.score >= limits.scoreThreshold &&
		hasUniqueWinnerMargin(top, second)
	) {
		return { stop: false, pick: top };
	}
	return { stop: false };
}

function pickBestSearchResult(
	overall: ScoredSearchCandidate[],
	lookupClient: ProviderTitleLookup<ProviderTitleResult>,
	scoreThreshold: number,
): ScoredSearchCandidate | undefined {
	const providerWinners = bestByProviderId(overall, lookupClient);
	if (providerWinners.length === 0) return undefined;
	const top = providerWinners[0];
	const second = providerWinners[1];
	if (
		top &&
		top.score >= scoreThreshold &&
		hasUniqueWinnerMargin(top, second)
	) {
		return top;
	}
	return undefined;
}

function buildSearchTerms(
	media: AniListMedia,
	provider: Provider,
	primaryTitleHint?: string,
): SearchTermEntry[] {
	const generatedTerms = makeTitleSearchTerms(
		provider,
		media.title ?? ({} as Record<string, never>),
		media.synonyms,
	);
	const terms: SearchTermEntry[] = [];
	const seen = new Set<string>();

	const register = (
		term: TitleSearchTerm | undefined,
		acceptedReasonOverride?: AcceptedMappingReason,
	) => {
		if (!term || seen.has(term.canonical)) {
			return;
		}
		seen.add(term.canonical);
		terms.push({
			term,
			...(acceptedReasonOverride ? { acceptedReasonOverride } : {}),
		});
	};

	register(
		primaryTitleHint
			? makeTitleSearchTerm(provider, primaryTitleHint)
			: undefined,
	);

	for (const term of generatedTerms) {
		register(term);
	}

	return terms;
}

function lookupOptions(
	ctx: CandidateSearchContext,
	forceNetwork = false,
): TitleLookupOptions {
	return {
		...(ctx.priority === undefined ? {} : { priority: ctx.priority }),
		...(forceNetwork ? { forceNetwork: true } : {}),
	};
}

async function lookupForTerm(
	term: TitleSearchTerm,
	ctx: CandidateSearchContext,
): Promise<ProviderTitleResult[]> {
	return ctx.lookupClient.lookupTitle(
		term,
		ctx.credentials,
		lookupOptions(ctx, ctx.forceLookupNetwork === true),
	);
}

function hasUniqueWinnerMargin(
	top: ScoredSearchCandidate,
	second: ScoredSearchCandidate | undefined,
): boolean {
	return !second || top.score - second.score >= MIN_WINNER_SCORE_MARGIN;
}

function resolvedOutcome(
	pick: ScoredSearchCandidate,
	ctx: CandidateSearchContext,
	searchTerms: string[],
	traceCandidates: Map<number, SearchedCandidate>,
): CandidateSearchOutcome | undefined {
	const providerId = ctx.lookupClient.readProviderId(pick.result);
	if (providerId === null) {
		return undefined;
	}

	return {
		status: "resolved",
		providerId,
		reason: pick.acceptedReason,
		confidence: pick.score,
		successfulSynonym: pick.term.display,
		searchTerms,
		candidates: finalizeTraceCandidates(traceCandidates),
	};
}

function unresolvedOutcome(
	reason: string,
	searchTerms: string[],
	traceCandidates: Map<number, SearchedCandidate>,
): CandidateSearchOutcome {
	return {
		status: "unresolved",
		reason,
		searchTerms,
		candidates: finalizeTraceCandidates(traceCandidates),
	};
}

function logStart(
	media: AniListMedia,
	ctx: CandidateSearchContext,
	primaryTitleHint?: string,
): void {
	if (!import.meta.env.DEV) {
		return;
	}

	ctx.log.debug?.(
		`pipeline:start anilistId=${media.id} priority=${ctx.priority ?? "normal"}${primaryTitleHint ? ` hint="${primaryTitleHint}"` : ""}`,
	);
}

function logResolved(
	media: AniListMedia,
	ctx: CandidateSearchContext,
	out: CandidateSearchOutcome,
): void {
	if (!import.meta.env.DEV || out.status !== "resolved") {
		return;
	}

	ctx.log.debug?.(
		`pipeline:resolved anilistId=${media.id} providerId=${out.providerId} confidence=${out.confidence} synonym="${out.successfulSynonym}"`,
	);
}

function logUnresolved(
	media: AniListMedia,
	ctx: CandidateSearchContext,
	reason: string,
): void {
	if (!import.meta.env.DEV) {
		return;
	}

	ctx.log.debug?.(`pipeline:unresolved anilistId=${media.id} reason=${reason}`);
}

function addTraceCandidates(
	registry: Map<number, SearchedCandidate>,
	scored: ScoredSearchCandidate[],
	lookupClient: ProviderTitleLookup<ProviderTitleResult>,
	isCandidateSuppressed?: (
		providerId: ProviderId,
		reason: AcceptedMappingReason,
	) => boolean,
): void {
	for (const candidate of scored) {
		const providerId = lookupClient.readProviderId(candidate.result);
		if (providerId === null) {
			continue;
		}

		const next: SearchedCandidate = {
			providerId,
			title: candidate.result.title,
			reason: candidate.acceptedReason,
			score: candidate.score,
			searchTerm: candidate.term.display,
			...(isCandidateSuppressed?.(providerId, candidate.acceptedReason)
				? { status: "rejected" as const }
				: {}),
		};
		const existing = registry.get(providerId);
		if (!existing || next.score > existing.score) {
			registry.set(providerId, next);
		}
	}
}

function finalizeTraceCandidates(
	registry: Map<number, SearchedCandidate>,
): SearchedCandidate[] {
	return [...registry.values()]
		.toSorted((left, right) => right.score - left.score)
		.slice(0, TRACE_CANDIDATE_LIMIT);
}

function filterSuppressedCandidates(
	scored: ScoredSearchCandidate[],
	ctx: CandidateSearchContext,
): ScoredSearchCandidate[] {
	if (!ctx.isCandidateSuppressed) {
		return scored;
	}

	return scored.filter((candidate) => {
		const providerId = ctx.lookupClient.readProviderId(candidate.result);
		return (
			providerId !== null &&
			!ctx.isCandidateSuppressed?.(providerId, candidate.acceptedReason)
		);
	});
}

export async function searchAutoMappingCandidates(
	media: AniListMedia,
	ctx: CandidateSearchContext,
	primaryTitleHint?: string,
): Promise<CandidateSearchOutcome> {
	logStart(media, ctx, primaryTitleHint);

	const mediaYear = media.startDate?.year ?? undefined;
	const provider = ctx.lookupClient.provider;
	const terms = buildSearchTerms(
		media,
		provider,
		primaryTitleHint,
	);
	const traceCandidates = new Map<number, SearchedCandidate>();
	const traceSearchTerms = terms
		.slice(0, ctx.limits.maxTerms)
		.map(({ term }) => term.display);

	const overall: ScoredSearchCandidate[] = [];
	const start = Date.now();

	for (const { term, acceptedReasonOverride } of terms.slice(
		0,
		ctx.limits.maxTerms,
	)) {
		if (!term.canonical) continue;

		const results = await lookupForTerm(term, ctx);
		const scored = scoreTitleMatches(provider, term, results, mediaYear).map(
			(candidate): ScoredSearchCandidate => ({
				...candidate,
				acceptedReason: acceptedReasonOverride ?? candidate.reason,
			}),
		);
		const acceptedScored = filterSuppressedCandidates(scored, ctx);
		overall.push(...acceptedScored);
		addTraceCandidates(
			traceCandidates,
			scored,
			ctx.lookupClient,
			ctx.isCandidateSuppressed,
		);

		const early = pickEarlySearchResult(
			acceptedScored,
			ctx.lookupClient,
			{
				earlyStopThreshold: ctx.limits.earlyStopThreshold,
				scoreThreshold: ctx.limits.scoreThreshold,
			},
		);
		if (early.stop && early.pick) {
			const out = resolvedOutcome(
				early.pick,
				ctx,
				traceSearchTerms,
				traceCandidates,
			);
			if (!out) {
				continue;
			}
			logResolved(media, ctx, out);
			return out;
		}

		// Optional soft time budget guard (kept minimal per constraints)
		if (Date.now() - start > PIPELINE_SOFT_TIME_BUDGET_MS) break;
	}

	overall.sort((a, b) => b.score - a.score);
	const pick = pickBestSearchResult(
		overall,
		ctx.lookupClient,
		ctx.limits.scoreThreshold,
	);
	if (pick) {
		const out = resolvedOutcome(pick, ctx, traceSearchTerms, traceCandidates);
		if (!out) {
			return unresolvedOutcome(
				"missing-provider-id",
				traceSearchTerms,
				traceCandidates,
			);
		}
		logResolved(media, ctx, out);
		return out;
	}

	logUnresolved(media, ctx, "low-confidence");
	return unresolvedOutcome("low-confidence", traceSearchTerms, traceCandidates);
}
