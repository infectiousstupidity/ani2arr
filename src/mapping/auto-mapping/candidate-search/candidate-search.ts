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

type CandidateSearchContext = {
	lookupClient: ProviderTitleLookup<ProviderTitleResult>;
	credentials: ProviderCredentials;
	priority?: RequestPriority;
	forceLookupNetwork?: boolean;
	isCandidateSuppressed?: (
		providerId: ProviderId,
		reason: AcceptedMappingReason,
	) => boolean;
	preferredTerms?: PreferredSearchTerm[];
	sessionSeenCanonical: Set<string>;
	limits: {
		maxTerms: number;
		scoreThreshold: number;
		earlyStopThreshold: number;
	};
	log: ScopedLogger;
};

export type PreferredSearchTerm = {
	rawTitle: string;
	acceptedReason: AcceptedMappingReason;
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

function pickEarlySearchResult(
	batch: ScoredSearchCandidate[],
	limits: EarlyStopLimits,
): { stop: boolean; pick?: ScoredSearchCandidate } {
	if (batch.length === 0) return { stop: false };
	const top = batch[0];
	const second = batch[1];
	if (top && top.score >= limits.earlyStopThreshold) {
		return { stop: true, pick: top };
	}
	if (
		top &&
		top.score >= limits.scoreThreshold &&
		(!second || top.score > second.score)
	) {
		return { stop: false, pick: top };
	}
	return { stop: false };
}

function pickBestSearchResult(
	overall: ScoredSearchCandidate[],
	scoreThreshold: number,
): ScoredSearchCandidate | undefined {
	if (overall.length === 0) return undefined;
	const top = overall[0];
	if (top && top.score >= scoreThreshold) return top;
	return undefined;
}

function buildSearchTerms(
	media: AniListMedia,
	provider: Provider,
	primaryTitleHint?: string,
	preferredTerms: readonly PreferredSearchTerm[] = [],
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

	for (const preferred of preferredTerms) {
		register(
			makeTitleSearchTerm(provider, preferred.rawTitle),
			preferred.acceptedReason,
		);
	}

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
	if (ctx.forceLookupNetwork) {
		return ctx.lookupClient.lookupTitle(
			term,
			ctx.credentials,
			lookupOptions(ctx, true),
		);
	}

	if (ctx.sessionSeenCanonical.has(term.canonical)) {
		const probe = await ctx.lookupClient.readCachedTitleLookup(term.canonical);
		if (probe.hit !== "none") {
			return probe.results;
		}
	}

	return ctx.lookupClient.lookupTitle(
		term,
		ctx.credentials,
		lookupOptions(ctx),
	);
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
		ctx.preferredTerms,
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

		// Mark canonical as seen once we've either looked up or confirmed a cache hit
		ctx.sessionSeenCanonical.add(term.canonical);

		const early = pickEarlySearchResult(acceptedScored, {
			earlyStopThreshold: ctx.limits.earlyStopThreshold,
			scoreThreshold: ctx.limits.scoreThreshold,
		});
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
	const pick = pickBestSearchResult(overall, ctx.limits.scoreThreshold);
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
