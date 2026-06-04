/** Provider-aware title normalization and scoring used by automatic mapping resolution. */
// src/mapping/resolve/title-matching.ts

import type { AniListMedia, AniListTitles } from "@/anilist/types";
import type { Provider } from "@/providers/types";

const STOPWORDS = new Set([
	"the",
	"a",
	"an",
	"of",
	"and",
	"or",
	"to",
	"for",
	"in",
	"on",
	"with",
	"at",
	"from",
	"my",
	"your",
	"our",
	"season",
	"tv",
	"series",
	"episode",
	"episodes",
	"part",
	"movie",
	"film",
	"limited",
	"special",
	"ultimate",
	"unlimited",
	"gift",
	"gifts",
	"edition",
	"deluxe",
	"complete",
	"volume",
	"vol",
	"vs",
	"versus",
]);

const YEAR_TOKEN_RE = /^(?:19|20)\d{2}$/;
const COMBINING_MARKS_RE = /[\u0300-\u036F]/g;
const ORDINAL_SUFFIX_RE = /^\d+(?:st|nd|rd|th)$/;
const DASH_VARIANTS_RE = /[\u2010-\u2015\u2043\u2212\u30FC\uFF0D]/g;
const ROMAN_NUMERAL_RE = /^[cdilmvx]+$/i;
const SEASON_CODE_RE = /^s\d+$/i;
const SEASON_INDICATORS = new Set(["season", "part", "cour"]);

const TRAILING_LOOKUP_SUFFIX_PATTERNS = [
	/\s+(?:final|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)?|[cdilmvx]+)\s+season$/i,
	/\s+season\s+(?:\d+(?:st|nd|rd|th)?|[cdilmvx]+)$/i,
	/\s+part\s+(?:\d+(?:st|nd|rd|th)?|[cdilmvx]+)$/i,
	/\s+cour\s+(?:\d+(?:st|nd|rd|th)?|[cdilmvx]+)$/i,
	/\s+s\d+$/i,
] as const;

const TITLE_TOKEN_WEIGHT = 0.6;
const TITLE_CHAR_WEIGHT = 0.4;
const YEAR_EXACT_SCORE_BONUS = 0.1;
const YEAR_NEAR_SCORE_BONUS = 0.06;
const YEAR_SCORE_CAP = 0.999;
const NON_ANIMATION_SCORE_FACTOR = 0.85;
const SHORT_QUERY_VERBOSE_RESULT_FACTOR = 0.85;
const RARE_TOKEN_MIN_LENGTH = 4;
const MINIMUM_SCORE = 0.82;
const MINIMUM_WINNER_MARGIN = 0.02;

type NormalizeTitleTokensOptions = {
	stripDiacritics?: boolean;
	filterStopwords?: boolean;
	keepYear?: boolean;
	mutateTokens?: boolean;
	allowSingleLetters?: boolean;
};

type NormalizeTitleTokensResult = {
	normalized: string;
	tokens: string[];
};

type TitleVariantSource =
	| "title"
	| "originalTitle"
	| "sortTitle"
	| "titleSlug"
	| "alternateTitle"
	| "folderName"
	| "queryRaw"
	| "querySanitized";

type TitleVariant = {
	source: TitleVariantSource;
	value: string;
};

type PrecomputedVariant = {
	variant: TitleVariant;
	norm: string;
	tokens: string[];
	compact: string;
	rareTokens: Set<string>;
};

type PrecomputedCandidate = {
	candidate: TitleCandidate;
	variants: PrecomputedVariant[];
};

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

type TitleVariantPairEvidence = {
	score: number;
	exactNormalized: boolean;
	exactCompact: boolean;
};

type ScoredCandidate = {
	candidate: TitleCandidate;
	matchedTitle: string;
	score: number;
};

export type TitleSearchTerm = {
	canonical: string;
	display: string;
};

export type TitleCandidate = {
	providerId: number;
	title: string;
	alternateTitles?: string[];
	originalTitle?: string;
	sortTitle?: string;
	titleSlug?: string;
	folderName?: string;
	year?: number;
	genres?: string[];
};

export type TitleMatch = {
	providerId: number;
	matchedTitle: string;
};

const DEFAULT_NORMALIZE_OPTIONS: Required<NormalizeTitleTokensOptions> = {
	stripDiacritics: false,
	filterStopwords: false,
	keepYear: false,
	mutateTokens: true,
	allowSingleLetters: true,
};

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

function cleanTitleDecorations(value: string): string {
	if (!value) return "";
	return value
		.replaceAll(/[\u3008-\u3011\u3014\u3015]/g, "")
		.replaceAll(/[\u2018-\u201F\u275B\u275C]/g, "")
		.replaceAll(/["']/g, "")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function baseNormalizeTitle(
	term: string,
	options: { stripDiacritics: boolean },
): string {
	if (!term) return "";

	const normalizedForm = options.stripDiacritics ? "NFKD" : "NFKC";
	let value = term.normalize(normalizedForm);
	if (options.stripDiacritics) {
		value = value.replaceAll(COMBINING_MARKS_RE, "").replaceAll("\u00DF", "ss");
	}

	return value
		.toLowerCase()
		.replaceAll("\u3000", " ")
		.replaceAll(DASH_VARIANTS_RE, "-")
		.replaceAll("~", "-")
		.replaceAll(/["'\u201C\u201D]/g, "")
		.replaceAll("\uFFFD", " ")
		.replaceAll("\u0007", " ")
		.replaceAll(/[():[\]{}]/g, " ")
		.replaceAll(/[^\d\sa-z\u3040-\u30FF\u4E00-\u9FAF-]/gi, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function normTitle(value: string): string {
	return value ? baseNormalizeTitle(value, { stripDiacritics: false }) : "";
}

function stripParenContent(value: string): string {
	return value
		.replaceAll(/\s*[([{].*?[)\]}]\s*/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function normalizeTitleTokens(
	term: string,
	options: NormalizeTitleTokensOptions = {},
): NormalizeTitleTokensResult {
	const merged = { ...DEFAULT_NORMALIZE_OPTIONS, ...options };
	const normalized = baseNormalizeTitle(term, {
		stripDiacritics: merged.stripDiacritics,
	});

	if (!normalized) {
		return { normalized: "", tokens: [] };
	}

	const rawTokens = normalized.replaceAll("-", " ").split(/\s+/);
	const tokens: string[] = [];

	for (const raw of rawTokens) {
		if (!raw) continue;
		let token = raw;
		if (merged.mutateTokens) {
			token = token.replace(/^lv(l)?$/, "level");
			if (token === "specials") token = "special";
		}
		if (merged.filterStopwords && STOPWORDS.has(token)) continue;
		if (!merged.allowSingleLetters && token.length === 1 && !/\d/.test(token)) {
			continue;
		}
		tokens.push(token);
	}

	if (!merged.keepYear) {
		while (tokens.length > 0 && YEAR_TOKEN_RE.test(tokens.at(-1)!)) {
			tokens.pop();
		}
	}

	return { normalized, tokens };
}

function tokenize(value: string): string[] {
	return normalizeTitleTokens(value, {
		filterStopwords: true,
		keepYear: true,
		allowSingleLetters: false,
	}).tokens;
}

function canonicalTitleKey(
	term: string,
	options: { keepYear?: boolean } = {},
): string {
	return normalizeTitleTokens(term, {
		stripDiacritics: true,
		filterStopwords: false,
		keepYear: options.keepYear === true,
		mutateTokens: false,
		allowSingleLetters: true,
	}).tokens.join(" ");
}

function stripSeasonalSuffixes(value: string): string {
	let normalized = value.trim();
	if (!normalized) return "";

	let previous = "";
	while (normalized && normalized !== previous) {
		previous = normalized;
		for (const pattern of TRAILING_LOOKUP_SUFFIX_PATTERNS) {
			normalized = normalized.replace(pattern, "").trim();
		}
	}

	return normalized;
}

function stripTrailingOrdinalOrNumber(value: string): string {
	const tokens = value.trim().split(/\s+/);
	if (tokens.length <= 1) return value.trim();
	while (tokens.length > 1) {
		const last = tokens.at(-1) as string;
		if (/^(?:\d+|\d+(?:st|nd|rd|th)|[cdilmvx]+)$/i.test(last)) {
			tokens.pop();
			continue;
		}
		break;
	}
	return tokens.join(" ").trim();
}

function stripSeasonPrefixSubtitle(value: string): string {
	const match = value.match(
		/^(.+?)\s+(?:\d+|\d+(?:st|nd|rd|th)|[cdilmvx]+)\s*[:：].+$/i,
	);
	const prefix = match?.[1]?.trim();
	return prefix && /[\p{L}\p{N}]/u.test(prefix) ? prefix : value;
}

function sanitizeSonarrLookupDisplay(value: string): string {
	if (!value) return "";
	let normalized = cleanTitleDecorations(value);
	normalized = normalized.replaceAll(/\[([^\]]+)]/g, "$1");
	normalized = stripSeasonPrefixSubtitle(normalized);
	normalized = stripSeasonalSuffixes(normalized);
	normalized = stripTrailingOrdinalOrNumber(normalized);
	normalized = stripParenContent(normalized).replaceAll(/\s+/g, " ").trim();
	return /[\p{L}\p{N}]/u.test(normalized) ? normalized : "";
}

function sanitizeRadarrLookupDisplay(value: string): string {
	if (!value) return "";
	let normalized = cleanTitleDecorations(value);
	normalized = normalized.replaceAll(/\[([^\]]+)]/g, "$1");
	normalized = stripParenContent(normalized).replaceAll(/\s+/g, " ").trim();
	return /[\p{L}\p{N}]/u.test(normalized) ? normalized : "";
}

export function sanitizeLookupDisplayForProvider(
	provider: Provider,
	rawTitle: string,
): string {
	return provider === "radarr"
		? sanitizeRadarrLookupDisplay(rawTitle)
		: sanitizeSonarrLookupDisplay(rawTitle);
}

export function canonicalTitleKeyForProvider(
	provider: Provider,
	rawTitle: string,
): string {
	const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
	const source =
		sanitized || stripParenContent(rawTitle).trim() || rawTitle.trim();
	return canonicalTitleKey(source);
}

function compactTitleKey(term: string): string {
	return canonicalTitleKey(term)
		.replaceAll(/[\s-]+/g, "")
		.trim();
}

function isSeasonOnlyTitleKey(tokens: string[]): boolean {
	return (
		tokens.length > 0 &&
		tokens.every(
			(token) =>
				ORDINAL_SUFFIX_RE.test(token) ||
				ROMAN_NUMERAL_RE.test(token) ||
				SEASON_CODE_RE.test(token) ||
				SEASON_INDICATORS.has(token),
		)
	);
}

function makeTitleSearchTerm(
	provider: Provider,
	rawTitle: string,
): TitleSearchTerm | undefined {
	const display = sanitizeLookupDisplayForProvider(provider, rawTitle.trim());
	if (!display) return undefined;
	const canonical = canonicalTitleKeyForProvider(provider, display);
	if (!canonical) return undefined;

	const tokens = canonical.split(/\s+/).filter(Boolean);
	if (tokens.length === 0 || isSeasonOnlyTitleKey(tokens)) {
		return undefined;
	}

	return { canonical, display };
}

export function getSearchTerms(
	provider: Provider,
	media: AniListMedia,
): TitleSearchTerm[] {
	return makeTitleSearchTerms(provider, media.title, media.synonyms);
}

function makeTitleSearchTerms(
	provider: Provider,
	titles: AniListTitles,
	synonyms?: string[],
): TitleSearchTerm[] {
	const seen = new Set<string>();
	const queue: Array<TitleSearchTerm & { priority: number; order: number }> =
		[];
	let order = 0;

	const register = (raw: string, priority: number) => {
		const term = makeTitleSearchTerm(provider, raw);
		if (!term || seen.has(term.canonical)) return;
		seen.add(term.canonical);
		queue.push({ ...term, priority, order: order++ });
	};

	const consider = (value: string | undefined, priority: number) => {
		if (!value) return;
		register(value, priority);
		const stripped = stripParenContent(value);
		if (stripped !== value) {
			register(stripped, priority + 0.5);
		}
	};

	consider(titles.english, 0);
	consider(titles.romaji, 10);
	consider(titles.native, 20);

	if (Array.isArray(synonyms)) {
		let synonymPriority = 30;
		for (const synonym of synonyms) {
			consider(synonym, synonymPriority);
			synonymPriority += 2;
		}
	}

	return queue
		.toSorted((left, right) =>
			left.priority === right.priority
				? left.order - right.order
				: left.priority - right.priority,
		)
		.map(({ canonical, display }) => ({ canonical, display }));
}

function diceBigram(left: string, right: string): number {
	if (left === right) return 1;
	if (left.length < 2 || right.length < 2) return 0;

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

	return (2 * matches) / (left.length - 1 + right.length - 1);
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

function readResultTitleVariants(
	provider: Provider,
	candidate: TitleCandidate,
): TitleVariant[] {
	const out: TitleVariant[] = [];
	const seen = new Set<string>();

	pushVariant(out, seen, candidate.title, "title");
	if (provider === "radarr") {
		pushVariant(out, seen, candidate.originalTitle, "originalTitle");
		pushVariant(out, seen, candidate.folderName, "folderName");
	}
	pushVariant(out, seen, candidate.sortTitle, "sortTitle");
	pushSlugVariants(out, seen, candidate.titleSlug);
	for (const title of candidate.alternateTitles ?? []) {
		pushVariant(out, seen, title, "alternateTitle");
	}

	return out;
}

function getTitleMatchProfile(provider: Provider): TitleMatchProfile {
	return provider === "radarr" ? RADARR_PROFILE : SONARR_PROFILE;
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

function hasRareTokenIntersection(
	query: string[],
	candidateRareTokens: Set<string>,
): boolean {
	return query.some(
		(token) =>
			token.length >= RARE_TOKEN_MIN_LENGTH && candidateRareTokens.has(token),
	);
}

function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score));
}

function isAliasVariant(source: TitleVariantSource): boolean {
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
	const charSimilarity = diceBigram(queryNorm, candidateNorm);
	return TITLE_TOKEN_WEIGHT * overlap + TITLE_CHAR_WEIGHT * charSimilarity;
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
	candidateVariant: PrecomputedVariant;
	candidateYear: number | undefined;
	targetYear: number | undefined;
}): TitleVariantPairEvidence | null {
	const {
		candidateVariant,
		queryNorm,
		queryCompact,
		queryTokens,
		profile,
		provider,
		candidateYear,
		targetYear,
	} = params;

	const candidateNorm = candidateVariant.norm;
	const candidateTokens = candidateVariant.tokens;
	const candidateCompact = candidateVariant.compact;

	const exactNormalized = queryNorm === candidateNorm;
	const exactCompact =
		Boolean(queryCompact) && queryCompact === candidateCompact;

	if (
		profile.rareTokenGate === "hard" &&
		!exactNormalized &&
		!exactCompact &&
		!hasRareTokenIntersection(queryTokens, candidateVariant.rareTokens)
	) {
		return null;
	}

	let score = scoreTextSimilarity(
		queryNorm,
		candidateNorm,
		queryTokens,
		candidateTokens,
	);

	if (exactNormalized) {
		score = Math.max(
			score,
			variantFloor(provider, candidateVariant.variant, "exact"),
		);
	}
	if (exactCompact) {
		score = Math.max(
			score,
			variantFloor(provider, candidateVariant.variant, "compact"),
		);
	}

	score = applyYearWeightingForProvider(
		provider,
		score,
		candidateYear,
		targetYear,
	);
	score = applyShortQueryPenalty(score, queryTokens, candidateNorm, queryNorm);

	return { score: clampScore(score), exactNormalized, exactCompact };
}

function scoreCandidate(input: {
	provider: Provider;
	term: TitleSearchTerm;
	targetYear: number | undefined;
	precomputedCandidate: PrecomputedCandidate;
	candidateCount: number;
}): ScoredCandidate {
	const { provider, term, targetYear, precomputedCandidate, candidateCount } =
		input;
	const { candidate, variants: candidateVariants } = precomputedCandidate;
	const profile = getTitleMatchProfile(provider);
	const queryVariants = makeQueryTitleVariants(provider, term.display);

	const precomputedQueryVariants = [];
	for (const queryVariant of queryVariants) {
		const queryNorm = normTitle(queryVariant.value);
		if (!queryNorm) continue;
		precomputedQueryVariants.push({
			norm: queryNorm,
			tokens: tokenize(queryNorm),
			compact: compactTitleKey(queryVariant.value),
		});
	}

	let best: TitleVariantPairEvidence = {
		score: 0,
		exactNormalized: false,
		exactCompact: false,
	};

	for (const pq of precomputedQueryVariants) {
		for (const pcVariant of candidateVariants) {
			const scored = scoreTitleVariantPair({
				provider,
				profile,
				queryNorm: pq.norm,
				queryTokens: pq.tokens,
				queryCompact: pq.compact,
				candidateVariant: pcVariant,
				candidateYear: candidate.year,
				targetYear,
			});
			if (scored && scored.score > best.score) {
				best = scored;
			}
		}
	}

	let score = applyGenreScore(best.score, candidate.genres);
	if (
		provider === "radarr" &&
		candidateCount === 1 &&
		score >= profile.singleResultFloor &&
		targetYear !== undefined &&
		candidate.year !== undefined &&
		targetYear === candidate.year
	) {
		score += profile.singleResultBoost;
	}

	return {
		candidate,
		matchedTitle: term.display,
		score: clampScore(score),
	};
}

function precomputeCandidateVariants(
	provider: Provider,
	candidate: TitleCandidate,
): PrecomputedCandidate {
	const rawVariants = readResultTitleVariants(provider, candidate);
	const variants: PrecomputedVariant[] = [];

	for (const variant of rawVariants) {
		const norm = normTitle(variant.value);
		if (!norm) continue;

		const tokens = tokenize(norm);
		const rareTokens = new Set(
			tokens.filter((token) => token.length >= RARE_TOKEN_MIN_LENGTH),
		);

		variants.push({
			variant,
			norm,
			tokens,
			compact: compactTitleKey(variant.value),
			rareTokens,
		});
	}

	return { candidate, variants };
}

function findTitleMatchForTermInternal(
	provider: Provider,
	term: TitleSearchTerm,
	targetYear: number | undefined,
	precomputedCandidates: PrecomputedCandidate[],
): TitleMatch | null {
	const scored = precomputedCandidates
		.map((pc) =>
			scoreCandidate({
				provider,
				term,
				targetYear,
				precomputedCandidate: pc,
				candidateCount: precomputedCandidates.length,
			}),
		)
		.toSorted((left, right) => right.score - left.score);

	const winner = scored[0];
	const second = scored[1];
	if (!winner || winner.score < MINIMUM_SCORE) return null;
	if (second && winner.score - second.score < MINIMUM_WINNER_MARGIN)
		return null;

	return {
		providerId: winner.candidate.providerId,
		matchedTitle: winner.matchedTitle,
	};
}

export function findTitleMatchForTerm(
	provider: Provider,
	term: TitleSearchTerm,
	targetYear: number | undefined,
	candidates: TitleCandidate[],
): TitleMatch | null {
	const precomputed = candidates.map((c) =>
		precomputeCandidateVariants(provider, c),
	);
	return findTitleMatchForTermInternal(provider, term, targetYear, precomputed);
}
