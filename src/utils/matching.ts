// src/utils/matching.ts
const STOPWORDS = new Set([
  'the','a','an','of','and','or','to','for','in','on','with','at','from','my','your','our',
  'season','tv','series','episode','episodes','part','movie','film','limited','special','ultimate',
  'unlimited','gift','gifts','edition','deluxe','complete','volume','vol','vs','versus'
]);

const YEAR_TOKEN_RE = /^(?:19|20)\d{2}$/;

const RARE_TOKEN_MIN_LEN = 4;

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const ORDINAL_SUFFIX_RE = /^\d+(?:st|nd|rd|th)$/;
const DASH_VARIANTS_RE = /[\u2010-\u2015\u2212\uFF0D\u2043\u30FC]/g;
const TRAILING_DESCRIPTOR_TOKENS = new Set(['season', 'part', 'cour', 'volume', 'vol', 'book', 'chapter']);

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

const DEFAULT_NORMALIZE_OPTIONS: Required<NormalizeTitleTokensOptions> = {
  stripDiacritics: false,
  filterStopwords: false,
  keepYear: false,
  mutateTokens: true,
  allowSingleLetters: true,
};

function baseNormalizeTitle(term: string, options: { stripDiacritics: boolean }): string {
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

function hasRareTokenIntersection(query: string[], cand: string[]): boolean {
  const setC = new Set(cand.filter(t => t.length >= RARE_TOKEN_MIN_LEN && !STOPWORDS.has(t)));
  for (const q of query) if (q.length >= RARE_TOKEN_MIN_LEN && setC.has(q)) return true;
  return false;
}

export function computeTitleMatchScore(params: {
  queryRaw: string;
  candidateRaw: string;
  candidateYear?: number;
  targetYear?: number;
  candidateGenres?: readonly string[];
}): number {
  const qn = normTitle(params.queryRaw);
  const cn = normTitle(params.candidateRaw);
  const qTok = tokenize(qn);
  const cTok = tokenize(cn);

  if (!hasRareTokenIntersection(qTok, cTok)) return 0;

  const overlap = tokenOverlap(qTok, cTok);
  const charSim = diceBigram(qn, cn);
  let score = 0.6 * overlap + 0.4 * charSim;

  if (params.targetYear !== undefined && params.candidateYear !== undefined) {
    const d = Math.abs(params.targetYear - params.candidateYear);
    if (d === 0) {
      score += 0.10;
    } else if (d === 1) {
      // Ensure bonus for year difference of 1 never pushes score to 1
      const maxScore = 0.999;
      const bonus = 0.06;
      if (score + bonus >= 1) {
        score = Math.min(maxScore, score + bonus);
      } else {
        score += bonus;
      }
    }
  }

  if (qTok.length <= 1 && cn.length > qn.length * 2) {
    score *= 0.85;
  }

  score = Math.max(0, Math.min(1, score));

  if (Array.isArray(params.candidateGenres) && params.candidateGenres.length > 0) {
    const normalizedGenres = params.candidateGenres.map(genre => genre.trim().toLowerCase());
    const hasAnimationGenre = normalizedGenres.some(
      genre => genre === 'animation' || genre === 'anime',
    );
    if (!hasAnimationGenre) {
      score *= 0.85;
    }
  }

  return Math.max(0, Math.min(1, score));
}

export function canonicalTitleKey(term: string, options: { keepYear?: boolean } = {}): string {
  const { tokens } = normalizeTitleTokens(term, {
    stripDiacritics: true,
    filterStopwords: false,
    keepYear: options.keepYear === true,
    mutateTokens: false,
    allowSingleLetters: true,
  });
  return tokens.join(' ');
}

export function isOrdinalToken(token: string): boolean {
  return ORDINAL_SUFFIX_RE.test(token);
}

// Remove decorative brackets/quotes while preserving content
function cleanTitleDecorations(s: string): string {
  if (!s) return '';
  return s
    .replace(/[\u3010\u3011\u300C\u300D\u300E\u300F\u3014\u3015\u3008\u3009\u300A\u300B]/g, '') // 【】「」『』〔〕〈〉《》
    .replace(/[“”‟„‚‘’\u2018-\u201F\u275B\u275C]/g, '') // fancy quotes range
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRomanNumeral(token: string): boolean {
  return /^[ivxlcdm]+$/i.test(token);
}

function isSeasonAnchor(token: string): boolean {
  const t = token.toLowerCase();
  return t === 'season' || t === 'part' || t === 'cour' || /^s\d+$/i.test(t) || /^season\d+$/i.test(t);
}

// Strips trailing season/part/cour suffixes like "Season 3", "Part 2", "2nd Season", "Cour II"
function stripSeasonalSuffixes(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);

  // Find direct anchors first (season|part|cour|s\d+|season\d+)
  let cut = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string;
    if (isSeasonAnchor(tok)) {
      cut = i;
      break;
    }
  }
  // Handle ordinal/roman + (season|part|cour)
  if (cut === -1) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i] as string;
      const b = (tokens[i + 1] ?? '').toLowerCase();
      if ((isOrdinalToken(a) || isRomanNumeral(a) || /^\d+$/.test(a)) && (b === 'season' || b === 'part' || b === 'cour')) {
        cut = i; // remove from the ordinal/roman position
        break;
      }
    }
  }
  if (cut > -1) {
    return tokens.slice(0, cut).join(' ').trim();
  }
  return trimmed;
}

// Remove a trailing pure ordinal/roman/numeric token without an explicit anchor
// Examples: "Sousou no Frieren 2nd" -> "Sousou no Frieren"
//           "Kagaku x Bouken Survival! II" -> "Kagaku x Bouken Survival!"
//           "Oshiri Tantei 9" -> "Oshiri Tantei"
function stripTrailingOrdinalOrNumber(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);
  if (tokens.length <= 1) return trimmed;

  const removedTokens: string[] = [];
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1] as string;
    if (isOrdinalToken(last) || isRomanNumeral(last) || /^\d+$/.test(last)) {
      removedTokens.push(last);
      tokens.pop();
      continue;
    }
    break;
  }

  if (removedTokens.length > 0 && tokens.length > 0) {
    const trailing = tokens[tokens.length - 1]!.toLowerCase();
    if (TRAILING_DESCRIPTOR_TOKENS.has(trailing)) {
      tokens.pop();
    }
  }

  return tokens.join(' ').trim();
}

export function sanitizeLookupDisplay(term: string): string {
  if (!term) return '';
  const cleaned = cleanTitleDecorations(term);
  const noParens = stripParenContent(cleaned);
  const reduced = stripSeasonalSuffixes(noParens);
  const trailingStripped = stripTrailingOrdinalOrNumber(reduced);
  return trailingStripped.replace(/\s+/g, ' ').trim();
}
