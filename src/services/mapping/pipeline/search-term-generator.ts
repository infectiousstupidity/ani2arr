import type { AniTitles } from '@/shared/types';
import { canonicalTitleKey, isOrdinalToken, stripParenContent, sanitizeLookupDisplay } from '@/shared/utils/matching';

export interface SearchTerm {
  canonical: string;
  display: string;
}

const SEASON_INDICATORS = new Set(['season', 'part', 'cour']);

// Intentionally permissive — detects Roman numeral-like tokens, not strict validation
const ROMAN_NUMERAL_RE = /^[ivxlcdm]+$/i;
const SEASON_CODE_RE = /^s\d+$/i;

export function isSeasonalCanonicalTokens(tokens: string[]): boolean {
  if (tokens.length === 0) {
    return false; // Empty input is not "seasonal"
  }
  return tokens.every(
    token => isOrdinalToken(token) || ROMAN_NUMERAL_RE.test(token) || SEASON_CODE_RE.test(token) || SEASON_INDICATORS.has(token),
  );
}

export function generateSearchTerms(titles: AniTitles, synonyms: string[] | undefined): SearchTerm[] {
  const seen = new Set<string>();
  const queue: Array<{ canonical: string; display: string; priority: number; order: number }> = [];
  let order = 0;

  const register = (raw: string, priority: number) => {
    const display = sanitizeLookupDisplay(raw.trim());
    if (!display) return;

    const canonical = canonicalTitleKey(display);
    if (!canonical || seen.has(canonical)) return;

    const canonicalTokens = canonical.split(/\s+/).filter(Boolean);
    if (canonicalTokens.length === 0) return;
    // Avoid season-only/ordinal-only lookups like "Season 3"
    if (isSeasonalCanonicalTokens(canonicalTokens)) return;

    seen.add(canonical);
    queue.push({ canonical, display, priority, order: order++ });
  };

  const consider = (value: string | undefined, priority: number) => {
    if (!value) return;
    const primary = sanitizeLookupDisplay(value);
    register(primary, priority);
    const stripped = sanitizeLookupDisplay(stripParenContent(value));
    if (stripped && stripped !== primary) {
      register(stripped, priority + 0.5);
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
    .sort((a, b) => (a.priority === b.priority ? a.order - b.order : a.priority - b.priority))
    .map(({ canonical, display }) => ({ canonical, display }));
}
