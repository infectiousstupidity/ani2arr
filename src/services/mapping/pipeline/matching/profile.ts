import type { MappingProvider } from '@/shared/types';
import { canonicalTitleKey } from './key';
import { canonicalizeLookupTerm, stripParenContent } from './normalize';
import { sanitizeLookupDisplay as sanitizeSonarrLookupDisplay } from './season';

export type CandidateTitleVariantSource =
  | 'title'
  | 'originalTitle'
  | 'sortTitle'
  | 'titleSlug'
  | 'alternateTitle'
  | 'folderName'
  | 'queryRaw'
  | 'querySanitized';

export interface CandidateTitleVariant {
  source: CandidateTitleVariantSource;
  value: string;
}

export interface MatchingProfile {
  provider: MappingProvider;
  rareTokenGate: 'hard' | 'none';
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
  compactIndexKeys: boolean;
}

const SONARR_PROFILE: MatchingProfile = {
  provider: 'sonarr',
  rareTokenGate: 'hard',
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
  compactIndexKeys: false,
};

const RADARR_PROFILE: MatchingProfile = {
  provider: 'radarr',
  rareTokenGate: 'none',
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
  compactIndexKeys: true,
};

function toTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pushVariant(
  out: CandidateTitleVariant[],
  seen: Set<string>,
  value: unknown,
  source: CandidateTitleVariantSource,
): void {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return;
  const dedupeKey = `${source}:${trimmed.toLowerCase()}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  out.push({ source, value: trimmed });
}

function pushSlugVariants(out: CandidateTitleVariant[], seen: Set<string>, value: unknown): void {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return;
  pushVariant(out, seen, trimmed, 'titleSlug');
  const spaced = trimmed.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (spaced && spaced !== trimmed) {
    pushVariant(out, seen, spaced, 'titleSlug');
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

    const nested = toTrimmedString((entry as { title?: unknown } | null)?.title);
    if (nested) {
      out.add(nested);
    }
  }
  return Array.from(out);
}

function extractSonarrCandidateTitleVariants(candidate: unknown): CandidateTitleVariant[] {
  const record = candidate as {
    title?: unknown;
    titleSlug?: unknown;
    alternateTitles?: unknown;
  } | null;
  const out: CandidateTitleVariant[] = [];
  const seen = new Set<string>();

  pushVariant(out, seen, record?.title, 'title');
  pushSlugVariants(out, seen, record?.titleSlug);
  for (const title of readAlternateTitles(record?.alternateTitles)) {
    pushVariant(out, seen, title, 'alternateTitle');
  }

  return out;
}

function extractRadarrCandidateTitleVariants(candidate: unknown): CandidateTitleVariant[] {
  const record = candidate as {
    title?: unknown;
    originalTitle?: unknown;
    sortTitle?: unknown;
    titleSlug?: unknown;
    folderName?: unknown;
    alternateTitles?: unknown;
  } | null;
  const out: CandidateTitleVariant[] = [];
  const seen = new Set<string>();

  pushVariant(out, seen, record?.title, 'title');
  pushVariant(out, seen, record?.originalTitle, 'originalTitle');
  pushVariant(out, seen, record?.sortTitle, 'sortTitle');
  pushSlugVariants(out, seen, record?.titleSlug);
  pushVariant(out, seen, record?.folderName, 'folderName');
  for (const title of readAlternateTitles(record?.alternateTitles)) {
    pushVariant(out, seen, title, 'alternateTitle');
  }

  return out;
}

export function getMatchingProfile(provider: MappingProvider): MatchingProfile {
  return provider === 'radarr' ? RADARR_PROFILE : SONARR_PROFILE;
}

export function compactTitleKey(term: string): string {
  const canonical = canonicalTitleKey(term);
  return canonical.replace(/[\s-]+/g, '').trim();
}

export function sanitizeLookupDisplayWithProfile(provider: MappingProvider, rawTitle: string): string {
  return sanitizeLookupDisplayForProvider(provider, rawTitle);
}

function cleanLookupDisplay(term: string): string {
  if (!term) return '';
  return term
    .replace(/[\u3010\u3011\u300C\u300D\u300E\u300F\u3014\u3015\u3008\u3009\u300A\u300B]/g, '')
    .replace(/[“”‟„‚‘’\u2018-\u201F\u275B\u275C]/g, '')
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeRadarrLookupDisplay(term: string): string {
  if (!term) return '';
  let s = cleanLookupDisplay(term);

  // Preserve meaningful content inside ASCII square brackets by unwrapping instead of removing.
  s = s.replace(/\[([^\]]+)\]/g, '$1');

  const noParens = stripParenContent(s);
  const normalized = noParens.replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(normalized) ? normalized : '';
}

export function sanitizeLookupDisplayForProvider(provider: MappingProvider, rawTitle: string): string {
  return provider === 'radarr'
    ? sanitizeRadarrLookupDisplay(rawTitle)
    : sanitizeSonarrLookupDisplay(rawTitle);
}

export function canonicalTitleKeyForProvider(
  provider: MappingProvider,
  rawTitle: string,
  options: { keepYear?: boolean } = {},
): string {
  const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
  const source = sanitized || stripParenContent(rawTitle).trim() || rawTitle.trim();
  return canonicalTitleKey(source, options);
}

export function canonicalizeLookupTermForProvider(
  provider: MappingProvider,
  rawTitle: string,
  options: { keepYear?: boolean } = {},
): string {
  const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
  const source = sanitized || stripParenContent(rawTitle).trim() || rawTitle.trim();
  return canonicalizeLookupTerm(source, options);
}

export function buildTitleIndexKeysForProvider(provider: MappingProvider, rawTitle: string): string[] {
  const trimmed = rawTitle.trim();
  if (!trimmed) return [];

  const profile = getMatchingProfile(provider);
  const out = new Set<string>();
  const candidates = new Set<string>([trimmed]);
  const sanitized = sanitizeLookupDisplayForProvider(provider, trimmed);
  const stripped = stripParenContent(trimmed);

  if (sanitized) candidates.add(sanitized);
  if (stripped) candidates.add(stripped);

  for (const candidate of candidates) {
    const canonical = canonicalizeLookupTermForProvider(provider, candidate);
    if (canonical) out.add(`title:${canonical}`);

    if (profile.compactIndexKeys) {
      const compact = compactTitleKey(candidate);
      if (compact) out.add(`compact:${compact}`);
    }
  }

  return Array.from(out);
}

export function buildQueryTitleVariantsForProvider(
  provider: MappingProvider,
  rawTitle: string,
): CandidateTitleVariant[] {
  const out: CandidateTitleVariant[] = [];
  const seen = new Set<string>();
  pushVariant(out, seen, rawTitle, 'queryRaw');

  const sanitized = sanitizeLookupDisplayForProvider(provider, rawTitle);
  if (sanitized && sanitized !== rawTitle.trim()) {
    pushVariant(out, seen, sanitized, 'querySanitized');
  }

  return out;
}

export function extractCandidateTitleVariants(
  provider: MappingProvider,
  candidate: unknown,
): CandidateTitleVariant[] {
  return provider === 'radarr'
    ? extractRadarrCandidateTitleVariants(candidate)
    : extractSonarrCandidateTitleVariants(candidate);
}
