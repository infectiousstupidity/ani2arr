/** Provider-aware title matching, variant extraction, and result ranking. */
// src/mapping/auto-mapping/title/title-matching.ts

import type { AcceptedMappingReason } from "@/mapping/types";
import type { Provider } from "@/providers";
import type { ProviderTitleResult } from "../lookup/provider-title-lookup";
import type { TitleSearchTerm } from "./title-search";
import {
	canonicalTitleKey,
	normTitle,
	sanitizeLookupDisplayForProvider,
	tokenize,
} from "./title-normalization";

const TITLE_TOKEN_WEIGHT = 0.6;
const TITLE_CHAR_WEIGHT = 0.4;

const YEAR_EXACT_SCORE_BONUS = 0.1;
const YEAR_NEAR_SCORE_BONUS = 0.06;
const YEAR_SCORE_CAP = 0.999; // avoid returning 1.0 solely due to one-off year bonus

const NON_ANIMATION_SCORE_FACTOR = 0.85;
const SHORT_QUERY_VERBOSE_RESULT_FACTOR = 0.85;
const RARE_TOKEN_MIN_LENGTH = 4;

type TitleMatchParams = {
	provider: Provider;
	queryRaw: string;
	candidate: unknown;
	candidateYear?: number;
	targetYear?: number;
	candidateGenres?: readonly string[];
	candidateCount?: number;
};

type TitleVariantPairEvidence = {
	score: number;
	exactNormalized: boolean;
	exactCompact: boolean;
};

export type TitleMatchReason = Extract<
	AcceptedMappingReason,
	"exact-title-match" | "fuzzy-match"
>;

export type TitleVariantSource =
	| "title"
	| "originalTitle"
	| "sortTitle"
	| "titleSlug"
	| "alternateTitle"
	| "folderName"
	| "queryRaw"
	| "querySanitized";

export interface TitleVariant {
	source: TitleVariantSource;
	value: string;
}

type TitleMatchProfile = {
	provider: Provider;
	rareTokenGate: "hard" | "none";
	yearExactBonus: number;
	yearOneOffBonus: number;
	yearMismatchFactor: number;
	yearFarMismatchFactor: number;
	exactTitleFloor: number;
	exactAliasFloor: number;
	compactTitleFloor: number;
	compactAliasFloor: number;
	singleResultBoost: number;
	singleResultFloor: number;
};

export interface TitleMatchCandidate<
	TResult extends ProviderTitleResult = ProviderTitleResult,
> {
	term: TitleSearchTerm;
	result: TResult;
	/**
	 * Confidence score in range [0, 1].
	 */
	score: number;
	reason: TitleMatchReason;
}

const SONARR_PROFILE: TitleMatchProfile = {
	provider: "sonarr",
	rareTokenGate: "hard",
	yearExactBonus: 0.1,
	yearOneOffBonus: 0.06,
	yearMismatchFactor: 1,
	yearFarMismatchFactor: 1,
	exactTitleFloor: 0.93,
	exactAliasFloor: 0.91,
	compactTitleFloor: 0.88,
	compactAliasFloor: 0.86,
	singleResultBoost: 0,
	singleResultFloor: 1,
};

const RADARR_PROFILE: TitleMatchProfile = {
	provider: "radarr",
	rareTokenGate: "none",
	yearExactBonus: 0.14,
	yearOneOffBonus: 0.03,
	yearMismatchFactor: 0.9,
	yearFarMismatchFactor: 0.72,
	exactTitleFloor: 0.94,
	exactAliasFloor: 0.96,
	compactTitleFloor: 0.9,
	compactAliasFloor: 0.94,
	singleResultBoost: 0.04,
	singleResultFloor: 0.82,
};

function diceBigram(left: string, right: string): number {
	if (left === right) return 1;
	if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;
	const map = new Map<string, number>();
	for (let index = 0; index < left.length - 1; index++) {
		const bigram = left.slice(index, index + 2);
		map.set(bigram, (map.get(bigram) ?? 0) + 1);
	}
	let matches = 0;
	for (let index = 0; index < right.length - 1; index++) {
		const bigram = right.slice(index, index + 2);
		const count = map.get(bigram);
		if (count && count > 0) {
			matches++;
			map.set(bigram, count - 1);
		}
	}
	return (2 * matches) / Math.max(left.length - 1 + right.length - 1, 1);
}

function tokenOverlap(query: string[], candidate: string[]): number {
	if (query.length === 0 || candidate.length === 0) return 0;
	const candidateTokens = new Set(candidate);
	let intersection = 0;
	for (const token of query) {
		if (candidateTokens.has(token)) intersection++;
	}
	return intersection / query.length;
}

function toTrimmedString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushVariant(
	out: TitleVariant[],
	seen: Set<string>,
	value: unknown,
	source: TitleVariantSource,
): void {
	const trimmed = toTrimmedString(value);
	if (!trimmed) return;
	const dedupeKey = `${source}:${trimmed.toLowerCase()}`;
	if (seen.has(dedupeKey)) return;
	seen.add(dedupeKey);
	out.push({ source, value: trimmed });
}

function pushSlugVariants(
	out: TitleVariant[],
	seen: Set<string>,
	value: unknown,
): void {
	const trimmed = toTrimmedString(value);
	if (!trimmed) return;
	pushVariant(out, seen, trimmed, "titleSlug");
	const spaced = trimmed
		.replaceAll(/[._-]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
	if (spaced && spaced !== trimmed) {
		pushVariant(out, seen, spaced, "titleSlug");
	}
}

function readAlternateTitles(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out = new Set<string>();
	for (const entry of value) {
		const direct = toTrimmedString(entry);
		if (direct) {
			out.add(direct);
			continue;
		}

		const nested = toTrimmedString(
			(entry as { title?: unknown } | null)?.title,
		);
		if (nested) {
			out.add(nested);
		}
	}
	return [...out];
}

function readSonarrResultTitleVariants(candidate: unknown): TitleVariant[] {
	const record = candidate as {
		title?: unknown;
		titleSlug?: unknown;
		alternateTitles?: unknown;
	} | null;
	const out: TitleVariant[] = [];
	const seen = new Set<string>();

	pushVariant(out, seen, record?.title, "title");
	pushSlugVariants(out, seen, record?.titleSlug);
	for (const title of readAlternateTitles(record?.alternateTitles)) {
		pushVariant(out, seen, title, "alternateTitle");
	}

	return out;
}

function readRadarrResultTitleVariants(candidate: unknown): TitleVariant[] {
	const record = candidate as {
		title?: unknown;
		originalTitle?: unknown;
		sortTitle?: unknown;
		titleSlug?: unknown;
		folderName?: unknown;
		alternateTitles?: unknown;
	} | null;
	const out: TitleVariant[] = [];
	const seen = new Set<string>();

	pushVariant(out, seen, record?.title, "title");
	pushVariant(out, seen, record?.originalTitle, "originalTitle");
	pushVariant(out, seen, record?.sortTitle, "sortTitle");
	pushSlugVariants(out, seen, record?.titleSlug);
	pushVariant(out, seen, record?.folderName, "folderName");
	for (const title of readAlternateTitles(record?.alternateTitles)) {
		pushVariant(out, seen, title, "alternateTitle");
	}

	return out;
}

function getTitleMatchProfile(provider: Provider): TitleMatchProfile {
	return provider === "radarr" ? RADARR_PROFILE : SONARR_PROFILE;
}

function compactTitleKey(term: string): string {
	const canonical = canonicalTitleKey(term);
	return canonical.replaceAll(/[\s-]+/g, "").trim();
}

function makeQueryTitleVariants(
	provider: Provider,
	rawTitle: string,
): TitleVariant[] {
	const out: TitleVariant[] = [];
	const seen = new Set<string>();
	pushVariant(out, seen, rawTitle, "queryRaw");

	const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
	if (sanitized && sanitized !== rawTitle.trim()) {
		pushVariant(out, seen, sanitized, "querySanitized");
	}

	return out;
}

export function readResultTitleVariants(
	provider: Provider,
	candidate: unknown,
): TitleVariant[] {
	return provider === "radarr"
		? readRadarrResultTitleVariants(candidate)
		: readSonarrResultTitleVariants(candidate);
}

function hasRareTokenIntersection(
	query: string[],
	candidate: string[],
): boolean {
	const candidateTokens = new Set(
		candidate.filter((token) => token.length >= RARE_TOKEN_MIN_LENGTH),
	);
	for (const token of query) {
		if (token.length >= RARE_TOKEN_MIN_LENGTH && candidateTokens.has(token)) {
			return true;
		}
	}
	return false;
}

function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score));
}

function isAliasVariant(source: TitleVariant["source"]): boolean {
	return source !== "title";
}

function variantFloor(
	provider: Provider,
	variant: TitleVariant,
	kind: "exact" | "compact",
): number {
	const profile = getTitleMatchProfile(provider);
	const alias = isAliasVariant(variant.source);
	if (kind === "exact") {
		return alias ? profile.exactAliasFloor : profile.exactTitleFloor;
	}
	return alias ? profile.compactAliasFloor : profile.compactTitleFloor;
}

function scoreTextSimilarity(
	queryNorm: string,
	candidateNorm: string,
	queryTokens: string[],
	candidateTokens: string[],
): number {
	const overlap = tokenOverlap(queryTokens, candidateTokens);
	const charSim = diceBigram(queryNorm, candidateNorm);
	return TITLE_TOKEN_WEIGHT * overlap + TITLE_CHAR_WEIGHT * charSim;
}

function applyYearScore(
	score: number,
	candidateYear?: number,
	targetYear?: number,
): number {
	if (targetYear === undefined || candidateYear === undefined) return score;
	const distance = Math.abs(targetYear - candidateYear);
	if (distance === 0)
		return Math.min(YEAR_SCORE_CAP, score + YEAR_EXACT_SCORE_BONUS);
	if (distance === 1)
		return Math.min(YEAR_SCORE_CAP, score + YEAR_NEAR_SCORE_BONUS);
	return score;
}

function applyGenreScore(
	score: number,
	candidateGenres?: readonly string[],
): number {
	if (!Array.isArray(candidateGenres) || candidateGenres.length === 0) {
		return score;
	}
	const normalizedGenres = candidateGenres.map((genre) =>
		genre.trim().toLowerCase(),
	);
	const hasAnimation = normalizedGenres.some(
		(genre) => genre === "animation" || genre === "anime",
	);
	return hasAnimation ? score : score * NON_ANIMATION_SCORE_FACTOR;
}

function applyShortQueryPenalty(
	score: number,
	queryTokens: string[],
	candidateNorm: string,
	queryNorm: string,
): number {
	if (queryTokens.length <= 1 && candidateNorm.length > queryNorm.length * 2) {
		return score * SHORT_QUERY_VERBOSE_RESULT_FACTOR;
	}
	return score;
}

function applyYearWeightingForProvider(
	provider: Provider,
	score: number,
	candidateYear?: number,
	targetYear?: number,
): number {
	if (provider === "sonarr") {
		return applyYearScore(score, candidateYear, targetYear);
	}

	if (targetYear === undefined || candidateYear === undefined) return score;
	const profile = getTitleMatchProfile(provider);
	const distance = Math.abs(targetYear - candidateYear);
	if (distance === 0)
		return Math.min(YEAR_SCORE_CAP, score + profile.yearExactBonus);
	if (distance === 1)
		return Math.min(YEAR_SCORE_CAP, score + profile.yearOneOffBonus);
	if (distance === 2) return score * profile.yearMismatchFactor;
	return score * profile.yearFarMismatchFactor;
}

function scoreTitleVariantPair(params: {
	provider: Provider;
	profile: TitleMatchProfile;
	queryNorm: string;
	queryTokens: string[];
	queryCompact: string;
	candidateVariant: TitleVariant;
	candidateYear?: number;
	targetYear?: number;
}): TitleVariantPairEvidence | null {
	const candidateNorm = normTitle(params.candidateVariant.value);
	if (!candidateNorm) return null;

	const candidateTokens = tokenize(candidateNorm);
	const candidateCompact = compactTitleKey(params.candidateVariant.value);
	const exactNormalized = params.queryNorm === candidateNorm;
	const exactCompact =
		Boolean(params.queryCompact) && params.queryCompact === candidateCompact;

	if (
		params.profile.rareTokenGate === "hard" &&
		!exactNormalized &&
		!exactCompact &&
		!hasRareTokenIntersection(params.queryTokens, candidateTokens)
	) {
		return null;
	}

	let score = scoreTextSimilarity(
		params.queryNorm,
		candidateNorm,
		params.queryTokens,
		candidateTokens,
	);

	if (exactNormalized) {
		score = Math.max(
			score,
			variantFloor(params.provider, params.candidateVariant, "exact"),
		);
	}
	if (exactCompact) {
		score = Math.max(
			score,
			variantFloor(params.provider, params.candidateVariant, "compact"),
		);
	}

	score = applyYearWeightingForProvider(
		params.provider,
		score,
		params.candidateYear,
		params.targetYear,
	);
	score = applyShortQueryPenalty(
		score,
		params.queryTokens,
		candidateNorm,
		params.queryNorm,
	);

	return { score: clampScore(score), exactNormalized, exactCompact };
}

function scoreTitleMatch(params: TitleMatchParams): {
	score: number;
	reason: TitleMatchReason;
} {
	const profile = getTitleMatchProfile(params.provider);
	const queryVariants = makeQueryTitleVariants(
		params.provider,
		params.queryRaw,
	);
	const candidateVariants = readResultTitleVariants(
		params.provider,
		params.candidate,
	);

	if (queryVariants.length === 0 || candidateVariants.length === 0) {
		return { score: 0, reason: "fuzzy-match" };
	}

	let best: TitleVariantPairEvidence = {
		score: 0,
		exactNormalized: false,
		exactCompact: false,
	};

	for (const queryVariant of queryVariants) {
		const queryNorm = normTitle(queryVariant.value);
		const queryTokens = tokenize(queryNorm);
		const queryCompact = compactTitleKey(queryVariant.value);

		if (!queryNorm) continue;

		for (const candidateVariant of candidateVariants) {
			const scored = scoreTitleVariantPair({
				provider: params.provider,
				profile,
				queryNorm,
				queryTokens,
				queryCompact,
				candidateVariant,
				...(typeof params.candidateYear === "number"
					? { candidateYear: params.candidateYear }
					: {}),
				...(typeof params.targetYear === "number"
					? { targetYear: params.targetYear }
					: {}),
			});
			if (scored && scored.score > best.score) {
				best = scored;
			}
		}
	}

	let score = applyGenreScore(best.score, params.candidateGenres);

	if (
		params.provider === "radarr" &&
		params.candidateCount === 1 &&
		score >= profile.singleResultFloor &&
		params.targetYear !== undefined &&
		params.candidateYear !== undefined &&
		params.targetYear === params.candidateYear
	) {
		score += profile.singleResultBoost;
	}

	return {
		score: clampScore(score),
		reason:
			best.exactNormalized || best.exactCompact
				? "exact-title-match"
				: "fuzzy-match",
	};
}

export function scoreTitleMatches<TResult extends ProviderTitleResult>(
	provider: Provider,
	term: TitleSearchTerm,
	results: TResult[],
	targetYear?: number,
): TitleMatchCandidate<TResult>[] {
	const scored: TitleMatchCandidate<TResult>[] = [];
	for (const candidate of results) {
		const evidence = scoreTitleMatch({
			provider,
			queryRaw: term.display,
			candidate,
			...(typeof candidate.year === "number"
				? { candidateYear: candidate.year }
				: {}),
			...(typeof targetYear === "number" ? { targetYear } : {}),
			...(Array.isArray(candidate.genres)
				? { candidateGenres: candidate.genres }
				: {}),
			candidateCount: results.length,
		});
		scored.push({
			term,
			result: candidate,
			score: evidence.score,
			reason: evidence.reason,
		});
	}
	return scored.toSorted((left, right) => right.score - left.score);
}
