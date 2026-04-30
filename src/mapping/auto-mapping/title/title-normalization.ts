/** Shared title normalization, tokenization, provider cleanup, and canonical keys. */
// src/mapping/auto-mapping/title/title-normalization.ts

import type { Provider } from "@/providers";

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

export const COMBINING_MARKS_RE = /[\u0300-\u036F]/g;
export const ORDINAL_SUFFIX_RE = /^\d+(?:st|nd|rd|th)$/;
export const DASH_VARIANTS_RE = /[\u2010-\u2015\u2043\u2212\u30FC\uFF0D]/g;

export type NormalizeTitleTokensOptions = {
	stripDiacritics?: boolean;
	filterStopwords?: boolean;
	keepYear?: boolean;
	mutateTokens?: boolean;
	allowSingleLetters?: boolean;
};

export type NormalizeTitleTokensResult = {
	normalized: string;
	tokens: string[];
};

const DEFAULT_NORMALIZE_OPTIONS: Required<NormalizeTitleTokensOptions> = {
	stripDiacritics: false,
	filterStopwords: false,
	keepYear: false,
	mutateTokens: true,
	allowSingleLetters: true,
};

const TRAILING_LOOKUP_SUFFIX_PATTERNS = [
	/\s+(?:final|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)?|[cdilmvx]+)\s+season$/i,
	/\s+season\s+(?:\d+(?:st|nd|rd|th)?|[cdilmvx]+)$/i,
	/\s+part\s+(?:\d+(?:st|nd|rd|th)?|[cdilmvx]+)$/i,
	/\s+cour\s+(?:\d+(?:st|nd|rd|th)?|[cdilmvx]+)$/i,
	/\s+s\d+$/i,
] as const;

function cleanTitleDecorations(value: string): string {
	if (!value) return "";
	return value
		.replaceAll(/[\u3008-\u3011\u3014\u3015]/g, "")
		.replaceAll(/[\u2018-\u201F\u275B\u275C]/g, "")
		.replaceAll(/["']/g, "")
		.replaceAll(/\s+/g, " ")
		.trim();
}

export function baseNormalizeTitle(
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

export function normTitle(value: string): string {
	if (!value) return "";
	return baseNormalizeTitle(value, { stripDiacritics: false });
}

export function stripParenContent(value: string): string {
	return value
		.replaceAll(/\s*[([{].*?[)\]}]\s*/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
}

export function normalizeTitleTokens(
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

export function tokenize(value: string): string[] {
	const { tokens } = normalizeTitleTokens(value, {
		filterStopwords: true,
		keepYear: true,
		allowSingleLetters: false,
	});
	return tokens;
}

export function canonicalizeLookupTerm(
	term: string,
	options: { keepYear?: boolean } = {},
): string {
	const { tokens } = normalizeTitleTokens(term, {
		filterStopwords: true,
		keepYear: options.keepYear === true,
		allowSingleLetters: false,
	});
	return tokens.join(" ");
}

export function canonicalTitleKey(
	term: string,
	options: { keepYear?: boolean } = {},
): string {
	const { tokens } = normalizeTitleTokens(term, {
		stripDiacritics: true,
		filterStopwords: false,
		keepYear: options.keepYear === true,
		mutateTokens: false,
		allowSingleLetters: true,
	});
	return tokens.join(" ");
}

export function isOrdinalToken(token: string): boolean {
	return ORDINAL_SUFFIX_RE.test(token);
}

export function stripSeasonalSuffixes(value: string): string {
	let normalized = value.trim();
	if (!normalized) return "";

	for (const pattern of TRAILING_LOOKUP_SUFFIX_PATTERNS) {
		normalized = normalized.replace(pattern, "").trim();
	}

	return normalized;
}

function stripTrailingOrdinalOrNumber(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const tokens = trimmed.split(/\s+/);
	if (tokens.length <= 1) return trimmed;

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

function sanitizeSonarrLookupDisplay(value: string): string {
	if (!value) return "";
	let normalized = cleanTitleDecorations(value);
	normalized = normalized.replaceAll(/\[([^\]]+)]/g, "$1");
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
	options: { keepYear?: boolean } = {},
): string {
	const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
	const source =
		sanitized || stripParenContent(rawTitle).trim() || rawTitle.trim();
	return canonicalTitleKey(source, options);
}

export function canonicalizeLookupTermForProvider(
	provider: Provider,
	rawTitle: string,
	options: { keepYear?: boolean } = {},
): string {
	const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
	const source =
		sanitized || stripParenContent(rawTitle).trim() || rawTitle.trim();
	return canonicalizeLookupTerm(source, options);
}
