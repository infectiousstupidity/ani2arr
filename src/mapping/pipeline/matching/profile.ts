/** Provider-specific title normalization and matching profile rules for mapping searches. */
// src/mapping/pipeline/matching/profile.ts

import type { Provider } from '@/providers';
import { sanitizeLookupDisplayForProvider } from '@/mapping/title-normalization';
import { canonicalTitleKey } from './key';

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
  provider: Provider;
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
  const spaced = trimmed.replaceAll(/[._-]+/g, ' ').replaceAll(/\s+/g, ' ').trim();
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
  return [...out];
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

export function getMatchingProfile(provider: Provider): MatchingProfile {
  return provider === 'radarr' ? RADARR_PROFILE : SONARR_PROFILE;
}

export function compactTitleKey(term: string): string {
  const canonical = canonicalTitleKey(term);
  return canonical.replaceAll(/[\s-]+/g, '').trim();
}

export function buildQueryTitleVariantsForProvider(
  provider: Provider,
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
  provider: Provider,
  candidate: unknown,
): CandidateTitleVariant[] {
  return provider === 'radarr'
    ? extractRadarrCandidateTitleVariants(candidate)
    : extractSonarrCandidateTitleVariants(candidate);
}
