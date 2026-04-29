/** Mapping pipeline execution for provider lookups, scoring, and final candidate selection. */
// src/mapping/pipeline/pipeline.ts

import {
	generateSearchTerms,
	isSeasonalCanonicalTokens,
	type SearchTerm,
} from "./search-term-generator";
import { scoreCandidates } from "./scoring";
import { maybeEarlyStop, pickBest } from "./early-stop";
import type {
	EvaluationOutcome,
	AniListMedia,
	PipelineEvaluatedCandidate,
} from "./types";
import {
	canonicalTitleKeyForProvider,
	sanitizeLookupDisplayForProvider,
} from "@/mapping/title-normalization";
import { PIPELINE_SOFT_TIME_BUDGET_MS } from "../auto-mapping/constants";
import type { AnibridgeMappingStore } from "../upstream-mapping";
import type { ScopedLogger } from "@/shared/utils/logger";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type { AniListMediaService } from "@/anilist";
import type { Provider, ProviderCredentials } from "@/providers";
import type {
	ProviderLookupClient,
	ProviderLookupOptions,
	ProviderLookupResult,
} from "../lookup";

const TRACE_CANDIDATE_LIMIT = 8;

type PipelineContext = {
	anilistApi: AniListMediaService;
	lookupClient: ProviderLookupClient<ProviderCredentials, ProviderLookupResult>;
	anibridgeMappingStore: AnibridgeMappingStore;
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

type ScoredPipelineCandidate = ReturnType<typeof scoreCandidates>[number];

function isSearchableCanonical(canonical: string): boolean {
	const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
	return (
		canonicalTokens.length > 0 && !isSeasonalCanonicalTokens(canonicalTokens)
	);
}

function searchTermFromHint(
	provider: Provider,
	primaryTitleHint?: string,
): SearchTerm | undefined {
	if (!primaryTitleHint) {
		return undefined;
	}

	const sanitized = sanitizeLookupDisplayForProvider(
		provider,
		primaryTitleHint.trim(),
	);
	if (!sanitized) {
		return undefined;
	}

	const canonical = canonicalTitleKeyForProvider(provider, sanitized);
	if (!canonical || !isSearchableCanonical(canonical)) {
		return undefined;
	}

	return { canonical, display: sanitized };
}

function buildSearchTerms(
	media: AniListMedia,
	provider: Provider,
	primaryTitleHint?: string,
): SearchTerm[] {
	const generatedTerms = generateSearchTerms(
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
	ctx: PipelineContext,
	forceNetwork = false,
): ProviderLookupOptions {
	return {
		...(ctx.priority === undefined ? {} : { priority: ctx.priority }),
		...(forceNetwork ? { forceNetwork: true } : {}),
	};
}

async function lookupForTerm(
	term: SearchTerm,
	ctx: PipelineContext,
): Promise<ProviderLookupResult[]> {
	if (ctx.forceLookupNetwork) {
		return ctx.lookupClient.lookup(
			term.canonical,
			term.display,
			ctx.credentials,
			lookupOptions(ctx, true),
		);
	}

	if (ctx.sessionSeenCanonical.has(term.canonical)) {
		const probe = await ctx.lookupClient.readFromCache(term.canonical);
		if (probe.hit !== "none") {
			return probe.results;
		}
	}

	return ctx.lookupClient.lookup(
		term.canonical,
		term.display,
		ctx.credentials,
		lookupOptions(ctx),
	);
}

function resolvedOutcome(
	pick: ScoredPipelineCandidate,
	ctx: PipelineContext,
	searchTerms: string[],
	traceCandidates: Map<number, PipelineEvaluatedCandidate>,
): EvaluationOutcome | undefined {
	const providerId = ctx.lookupClient.getProviderId(pick.result);
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
	traceCandidates: Map<number, PipelineEvaluatedCandidate>,
): EvaluationOutcome {
	return {
		status: "unresolved",
		reason,
		searchTerms,
		candidates: finalizeTraceCandidates(traceCandidates),
	};
}

function logStart(
	media: AniListMedia,
	ctx: PipelineContext,
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
	ctx: PipelineContext,
	out: EvaluationOutcome,
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
	ctx: PipelineContext,
	reason: string,
): void {
	if (!import.meta.env.DEV) {
		return;
	}

	ctx.log.debug?.(`pipeline:unresolved anilistId=${media.id} reason=${reason}`);
}

function addTraceCandidates(
	registry: Map<number, PipelineEvaluatedCandidate>,
	scored: ReturnType<typeof scoreCandidates>,
	lookupClient: ProviderLookupClient<ProviderCredentials, ProviderLookupResult>,
): void {
	for (const candidate of scored) {
		const providerId = lookupClient.getProviderId(candidate.result);
		if (providerId === null) {
			continue;
		}

		const next: PipelineEvaluatedCandidate = {
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
	registry: Map<number, PipelineEvaluatedCandidate>,
): PipelineEvaluatedCandidate[] {
	return [...registry.values()]
		.toSorted((left, right) => right.score - left.score)
		.slice(0, TRACE_CANDIDATE_LIMIT);
}

export async function resolveViaPipeline(
	media: AniListMedia,
	ctx: PipelineContext,
	primaryTitleHint?: string,
): Promise<EvaluationOutcome> {
	logStart(media, ctx, primaryTitleHint);

	const mediaYear = media.startDate?.year ?? undefined;
	const provider = ctx.lookupClient.provider;
	const terms = buildSearchTerms(media, provider, primaryTitleHint);
	const traceCandidates = new Map<number, PipelineEvaluatedCandidate>();
	const traceSearchTerms = terms
		.slice(0, ctx.limits.maxTerms)
		.map((term) => term.display);

	const overall: ScoredPipelineCandidate[] = [];
	const start = Date.now();

	for (const term of terms.slice(0, ctx.limits.maxTerms)) {
		if (!term.canonical) continue;

		const results = await lookupForTerm(term, ctx);
		const scored = scoreCandidates(provider, term, results, mediaYear);
		overall.push(...scored);
		addTraceCandidates(traceCandidates, scored, ctx.lookupClient);

		// Mark canonical as seen once we've either looked up or confirmed a cache hit
		ctx.sessionSeenCanonical.add(term.canonical);

		const early = maybeEarlyStop(scored, {
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
	const pick = pickBest(overall, ctx.limits.scoreThreshold);
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
