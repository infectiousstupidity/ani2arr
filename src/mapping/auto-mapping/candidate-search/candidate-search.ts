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
	sessionSeenCanonical: Set<string>;
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
	reason: Extract<AcceptedMappingReason, "exact-title-match" | "fuzzy-match">;
	score: number;
	searchTerm: string;
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

type ScoredSearchCandidate = ReturnType<typeof scoreTitleMatches>[number];

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

function searchTermFromHint(
	provider: Provider,
	primaryTitleHint?: string,
): TitleSearchTerm | undefined {
	if (!primaryTitleHint) {
		return undefined;
	}
	return makeTitleSearchTerm(provider, primaryTitleHint);
}

function buildSearchTerms(
	media: AniListMedia,
	provider: Provider,
	primaryTitleHint?: string,
): TitleSearchTerm[] {
	const generatedTerms = makeTitleSearchTerms(
		provider,
		media.title ?? ({} as Record<string, never>),
		media.synonyms,
	);
	const hintTerm = searchTermFromHint(provider, primaryTitleHint);
	if (!hintTerm) {
		return generatedTerms;
	}

	return [
		hintTerm,
		...generatedTerms.filter((term) => term.canonical !== hintTerm.canonical),
	];
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
		reason: pick.reason,
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
	scored: ReturnType<typeof scoreTitleMatches>,
	lookupClient: ProviderTitleLookup<ProviderTitleResult>,
): void {
	for (const candidate of scored) {
		const providerId = lookupClient.readProviderId(candidate.result);
		if (providerId === null) {
			continue;
		}

		const next: SearchedCandidate = {
			providerId,
			title: candidate.result.title,
			reason: candidate.reason,
			score: candidate.score,
			searchTerm: candidate.term.display,
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

export async function searchAutoMappingCandidates(
	media: AniListMedia,
	ctx: CandidateSearchContext,
	primaryTitleHint?: string,
): Promise<CandidateSearchOutcome> {
	logStart(media, ctx, primaryTitleHint);

	const mediaYear = media.startDate?.year ?? undefined;
	const provider = ctx.lookupClient.provider;
	const terms = buildSearchTerms(media, provider, primaryTitleHint);
	const traceCandidates = new Map<number, SearchedCandidate>();
	const traceSearchTerms = terms
		.slice(0, ctx.limits.maxTerms)
		.map((term) => term.display);

	const overall: ScoredSearchCandidate[] = [];
	const start = Date.now();

	for (const term of terms.slice(0, ctx.limits.maxTerms)) {
		if (!term.canonical) continue;

		const results = await lookupForTerm(term, ctx);
		const scored = scoreTitleMatches(provider, term, results, mediaYear);
		overall.push(...scored);
		addTraceCandidates(traceCandidates, scored, ctx.lookupClient);

		// Mark canonical as seen once we've either looked up or confirmed a cache hit
		ctx.sessionSeenCanonical.add(term.canonical);

		const early = pickEarlySearchResult(scored, {
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
