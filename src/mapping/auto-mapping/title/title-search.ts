/** Provider-aware title search term preparation for auto-mapping lookups. */
// src/mapping/auto-mapping/title/title-search.ts

import type { Provider } from "@/providers";
import type { AniListTitles } from "@/anilist/schemas/media.schema";
import {
	canonicalTitleKeyForProvider,
	isOrdinalToken,
	sanitizeLookupDisplayForProvider,
	stripParenContent,
} from "./title-normalization";

export interface TitleSearchTerm {
	canonical: string;
	display: string;
}

const SEASON_INDICATORS = new Set(["season", "part", "cour"]);

// Intentionally permissive: detects Roman numeral-like tokens, not strict validation.
const ROMAN_NUMERAL_RE = /^[cdilmvx]+$/i;
const SEASON_CODE_RE = /^s\d+$/i;

export function isSeasonOnlyTitleKey(tokens: string[]): boolean {
	if (tokens.length === 0) {
		return false;
	}
	return tokens.every(
		(token) =>
			isOrdinalToken(token) ||
			ROMAN_NUMERAL_RE.test(token) ||
			SEASON_CODE_RE.test(token) ||
			SEASON_INDICATORS.has(token),
	);
}

export function makeTitleSearchTerm(
	provider: Provider,
	rawTitle: string,
): TitleSearchTerm | undefined {
	const display = sanitizeLookupDisplayForProvider(provider, rawTitle.trim());
	if (!display) {
		return undefined;
	}

	const canonical = canonicalTitleKeyForProvider(provider, display);
	if (!canonical) {
		return undefined;
	}

	const tokens = canonical.split(/\s+/).filter(Boolean);
	if (tokens.length === 0 || isSeasonOnlyTitleKey(tokens)) {
		return undefined;
	}

	return { canonical, display };
}

export function makeTitleSearchTerms(
	provider: Provider,
	titles: AniListTitles,
	synonyms?: string[],
): TitleSearchTerm[] {
	const seen = new Set<string>();
	const queue: Array<{
		canonical: string;
		display: string;
		priority: number;
		order: number;
	}> = [];
	let order = 0;

	const register = (raw: string, priority: number) => {
		const term = makeTitleSearchTerm(provider, raw);
		if (!term) return;
		const { canonical, display } = term;
		if (!canonical || seen.has(canonical)) return;

		seen.add(canonical);
		queue.push({ canonical, display, priority, order: order++ });
	};

	const consider = (value: string | undefined, priority: number) => {
		if (!value) return;
		const primary = makeTitleSearchTerm(provider, value);
		register(value, priority);
		const strippedRaw = stripParenContent(value);
		const stripped = makeTitleSearchTerm(provider, strippedRaw);
		if (stripped && stripped.canonical !== primary?.canonical) {
			register(strippedRaw, priority + 0.5);
		}
	};

	consider(titles.english ?? undefined, 0);
	consider(titles.romaji ?? undefined, 10);
	consider(titles.native ?? undefined, 20);

	if (Array.isArray(synonyms)) {
		let synonymPriority = 30;
		for (const synonym of synonyms) {
			consider(synonym ?? undefined, synonymPriority);
			synonymPriority += 2;
		}
	}

	return queue
		.toSorted((a, b) =>
			a.priority === b.priority ? a.order - b.order : a.priority - b.priority,
		)
		.map(({ canonical, display }) => ({ canonical, display }));
}
