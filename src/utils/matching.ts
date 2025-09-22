const STOPWORDS = new Set([
  'the','a','an','of','and','or','to','for','in','on','with','at','from','my','your','our',
  'season','tv','series','episode','episodes','part','movie','film','limited','special','ultimate',
  'lv','lvl','level','unlimited','gift','gifts','edition','deluxe','complete'
]);

const RARE_TOKEN_MIN_LEN = 4;

export function normTitle(s: string): string {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u3000]/g, ' ')
    .replace(/[\u2010-\u2015–—~]/g, '-')
    .replace(/[“”"']/g, '')
    .replace(/[·・•]/g, ' ')
    .replace(/[():[\]{}]/g, ' ')
    .replace(/[^0-9a-z\u3040-\u30ff\u4e00-\u9faf\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripParenContent(s: string): string {
  return s.replace(/\s*[([{].*?[)\]}]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const p of s.split(/\s|-/)) {
    if (!p) continue;
    if (STOPWORDS.has(p)) continue;
    const t = p.replace(/^lv(l)?$/,'level');
    if (t.length === 1) continue;
    out.push(t);
  }
  return out;
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
    if (v && v > 0) { matches++; map.set(bg, v - 1); }
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

function isGenreMismatch(genres?: readonly string[]): boolean {
  if (!genres || genres.length === 0) return false;
  const lowerGenres = genres.map(g => g.toLowerCase());
  const hasAnimeGenre = lowerGenres.includes('anime') || lowerGenres.includes('animation');
  if (hasAnimeGenre) return false;
  
  const hasLiveActionGenre = lowerGenres.includes('drama') || lowerGenres.includes('comedy') || lowerGenres.includes('documentary') || lowerGenres.includes('western');
  return hasLiveActionGenre;
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
    if (d === 0) score += 0.10;
    else if (d === 1) score += 0.06;
  }
  
  if (isGenreMismatch(params.candidateGenres)) {
    score -= 0.5;
  }

  if (qTok.length <= 1 && cn.length > qn.length * 2) {
    score *= 0.85;
  }

  return Math.max(0, Math.min(1, score));
}