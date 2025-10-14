// Normalization and tokenization utilities used by matching.

const STOPWORDS = new Set([
  'the','a','an','of','and','or','to','for','in','on','with','at','from','my','your','our',
  'season','tv','series','episode','episodes','part','movie','film','limited','special','ultimate',
  'unlimited','gift','gifts','edition','deluxe','complete','volume','vol','vs','versus'
]);

const YEAR_TOKEN_RE = /^(?:19|20)\d{2}$/;

export const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
export const ORDINAL_SUFFIX_RE = /^\d+(?:st|nd|rd|th)$/;
export const DASH_VARIANTS_RE = /[\u2010-\u2015\u2212\uFF0D\u2043\u30FC]/g;

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

export function baseNormalizeTitle(term: string, options: { stripDiacritics: boolean }): string {
  if (!term) return '';

  const normalizedForm = options.stripDiacritics ? 'NFKD' : 'NFKC';

  let value = term.normalize(normalizedForm);
  if (options.stripDiacritics) {
    value = value.replace(COMBINING_MARKS_RE, '').replace(/\u00df/g, 'ss');
  }

  return value
    .toLowerCase()
    .replace(/[\u3000]/g, ' ')
    .replace(DASH_VARIANTS_RE, '-')
    .replace(/[~]/g, '-')
    .replace(/["""']/g, '')
    .replace(/[\uFFFD]/g, ' ')
    // eslint-disable-next-line no-control-regex -- sanitize stray BEL characters observed in scraped titles
    .replace(/\u0007/g, ' ')
    .replace(/[():[\]{}]/g, ' ')
    .replace(/[^0-9a-z\u3040-\u30ff\u4e00-\u9faf\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normTitle(s: string): string {
  if (!s) return '';
  return baseNormalizeTitle(s, { stripDiacritics: false });
}

export function stripParenContent(s: string): string {
  // Remove bracketed/parenthetical segments like (..), [..], {..}
  return s.replace(/\s*[([{].*?[)\]}]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeTitleTokens(
  term: string,
  options: NormalizeTitleTokensOptions = {},
): NormalizeTitleTokensResult {
  const merged = { ...DEFAULT_NORMALIZE_OPTIONS, ...options };
  const normalized = baseNormalizeTitle(term, { stripDiacritics: merged.stripDiacritics });

  if (!normalized) {
    return { normalized: '', tokens: [] };
  }

  const rawTokens = normalized.replace(/-/g, ' ').split(/\s+/);
  const tokens: string[] = [];

  for (const raw of rawTokens) {
    if (!raw) continue;
    let token = raw;

    if (merged.mutateTokens) {
      token = token.replace(/^lv(l)?$/, 'level');
      if (token === 'specials') token = 'special';
    }

    if (merged.filterStopwords && STOPWORDS.has(token)) continue;
    if (!merged.allowSingleLetters && token.length === 1 && !/\d/.test(token)) continue;

    tokens.push(token);
  }

  if (!merged.keepYear) {
    while (tokens.length > 0 && YEAR_TOKEN_RE.test(tokens[tokens.length - 1]!)) {
      tokens.pop();
    }
  }

  return { normalized, tokens };
}

export function tokenize(s: string): string[] {
  const { tokens } = normalizeTitleTokens(s, {
    filterStopwords: true,
    keepYear: true,
    allowSingleLetters: false,
  });
  return tokens;
}

export function canonicalizeLookupTerm(term: string, options: { keepYear?: boolean } = {}): string {
  const { tokens } = normalizeTitleTokens(term, {
    filterStopwords: true,
    keepYear: options.keepYear === true,
    allowSingleLetters: false,
  });
  return tokens.join(' ');
}

export function diceBigram(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const map = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const v = map.get(bg);
    if (v && v > 0) {
      matches++;
      map.set(bg, v - 1);
    }
  }
  return (2 * matches) / (Math.max(a.length - 1 + b.length - 1, 1));
}

export function tokenOverlap(query: string[], cand: string[]): number {
  if (!query.length || !cand.length) return 0;
  const setC = new Set(cand);
  let inter = 0;
  for (const q of query) if (setC.has(q)) inter++;
  return inter / query.length;
}

export function isOrdinalToken(token: string): boolean {
  return ORDINAL_SUFFIX_RE.test(token);
}

export { STOPWORDS };
