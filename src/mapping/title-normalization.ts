/** Shared provider-aware title cleanup for lookup terms and canonical keys. */
// src/mapping/title-normalization.ts

import type { Provider } from "@/providers";
import { canonicalTitleKey } from "@/mapping/pipeline/matching/key";
import {
	canonicalizeLookupTerm,
	stripParenContent,
} from "@/mapping/pipeline/matching/normalize";

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
