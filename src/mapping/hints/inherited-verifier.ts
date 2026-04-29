/** Sonarr inherited-candidate verification against exact provider metadata. */
// src/mapping/hints/inherited-verifier.ts

import type { AniListId } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import {
  extractCandidateTitleVariants,
  normalizeTitleTokens,
  sanitizeLookupDisplayForProvider,
  stripSeasonalSuffixes,
} from '@/mapping/pipeline/matching';
import type { ProviderCredentials, SonarrLookupSeries, TvdbId } from '@/providers';
import type { ProviderLookupClient } from '../lookup';
import type { InheritedMappingVerificationDetails } from '../types';

const SEASON_INDICATORS = new Set(['season', 'part', 'cour']);
const ROMAN_NUMERAL_RE = /^[cdilmvx]+$/i;
const SEASON_CODE_RE = /^s\d+$/i;

type InheritedProposal = {
  providerId: TvdbId;
  borrowedBaseTitle?: string;
  immediateSourceAniListId: AniListId;
  chainAnchorAniListId: AniListId;
};

type ExactSonarrLookupClient = Pick<
  ProviderLookupClient<ProviderCredentials, SonarrLookupSeries>,
  'lookupExactByProviderId'
>;

export interface InheritedVerificationResult {
  verdict: 'accept' | 'reject' | 'ambiguous' | 'verification-failed';
  title?: string;
  details: InheritedMappingVerificationDetails;
}

function collectCurrentTitles(media: AniListMedia): string[] {
  return [
    media.title?.english,
    media.title?.romaji,
    media.title?.native,
    ...(Array.isArray(media.synonyms) ? media.synonyms : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function toFamilyKey(value: string): string {
  const sanitized = sanitizeLookupDisplayForProvider('sonarr', value);
  const stripped = stripSeasonalSuffixes(sanitized || value.trim());
  const { tokens } = normalizeTitleTokens(stripped, {
    filterStopwords: true,
    keepYear: false,
    allowSingleLetters: false,
  });

  return tokens
    .filter(token => !SEASON_INDICATORS.has(token) && !ROMAN_NUMERAL_RE.test(token) && !SEASON_CODE_RE.test(token))
    .join(' ');
}

function collectFamilyKeys(values: readonly string[]): string[] {
  const families = new Set<string>();

  for (const value of values) {
    const family = toFamilyKey(value);
    if (family) {
      families.add(family);
    }
  }

  return [...families];
}

function hasFamilyOverlap(left: readonly string[], right: readonly string[]): boolean {
  for (const leftFamily of left) {
    const leftTokens = new Set(leftFamily.split(/\s+/).filter(Boolean));
    for (const rightFamily of right) {
      const rightTokens = rightFamily.split(/\s+/).filter(Boolean);
      if (rightTokens.some(token => leftTokens.has(token))) {
        return true;
      }
    }
  }

  return false;
}

export async function verifyInheritedSonarrCandidate(
  media: AniListMedia,
  proposal: InheritedProposal,
  lookupClient: ExactSonarrLookupClient,
  credentials: ProviderCredentials,
): Promise<InheritedVerificationResult> {
  if (typeof lookupClient.lookupExactByProviderId !== 'function') {
    return {
      verdict: 'verification-failed',
      details: {
        reason: 'Sonarr exact verification is unavailable for inherited mapping.',
        positiveSignals: [],
        contradictions: [],
        immediateSourceAniListId: proposal.immediateSourceAniListId,
        chainAnchorAniListId: proposal.chainAnchorAniListId,
      },
    };
  }

  let exactLookup: SonarrLookupSeries | null;
  try {
    exactLookup = await lookupClient.lookupExactByProviderId(proposal.providerId, credentials);
  } catch {
    return {
      verdict: 'verification-failed',
      details: {
        reason: 'Exact Sonarr lookup failed while verifying the inherited mapping.',
        positiveSignals: [],
        contradictions: [],
        immediateSourceAniListId: proposal.immediateSourceAniListId,
        chainAnchorAniListId: proposal.chainAnchorAniListId,
      },
    };
  }

  if (!exactLookup) {
    return {
      verdict: 'verification-failed',
      details: {
        reason: 'Exact Sonarr lookup returned no metadata for the inherited provider ID.',
        positiveSignals: [],
        contradictions: [],
        immediateSourceAniListId: proposal.immediateSourceAniListId,
        chainAnchorAniListId: proposal.chainAnchorAniListId,
      },
    };
  }

  const providerTitles = extractCandidateTitleVariants('sonarr', exactLookup).map(variant => variant.value);
  if (providerTitles.length === 0) {
    return {
      verdict: 'verification-failed',
      details: {
        reason: 'Exact Sonarr lookup did not expose usable title metadata for verification.',
        positiveSignals: [],
        contradictions: [],
        immediateSourceAniListId: proposal.immediateSourceAniListId,
        chainAnchorAniListId: proposal.chainAnchorAniListId,
      },
    };
  }

  const currentFamilies = collectFamilyKeys(collectCurrentTitles(media));
  const borrowedFamilies = proposal.borrowedBaseTitle ? collectFamilyKeys([proposal.borrowedBaseTitle]) : [];
  const providerFamilies = collectFamilyKeys(providerTitles);
  const positiveSignals: string[] = [];
  const contradictions: string[] = [];

  if (providerFamilies.some(family => currentFamilies.includes(family))) {
    positiveSignals.push('Exact Sonarr titles match the current AniList title family.');
  } else if (hasFamilyOverlap(providerFamilies, currentFamilies)) {
    positiveSignals.push('Exact Sonarr titles overlap the current AniList title family.');
  }

  if (borrowedFamilies.length > 0) {
    if (providerFamilies.some(family => borrowedFamilies.includes(family))) {
      positiveSignals.push('Exact Sonarr titles match the trusted related-entry base title family.');
    } else if (hasFamilyOverlap(providerFamilies, borrowedFamilies)) {
      positiveSignals.push('Exact Sonarr titles overlap the trusted related-entry base title family.');
    }
  }

  const referenceFamilies = [...new Set([...currentFamilies, ...borrowedFamilies])];
  if (referenceFamilies.length > 0 && providerFamilies.length > 0 && !hasFamilyOverlap(providerFamilies, referenceFamilies)) {
    contradictions.push('Exact Sonarr titles conflict with the current and trusted related AniList title families.');
  }

  const details: InheritedMappingVerificationDetails = {
    reason:
      contradictions.length > 0
        ? contradictions[0]!
        : positiveSignals[0] ?? 'Exact Sonarr metadata was too weak to accept the inherited mapping.',
    positiveSignals,
    contradictions,
    immediateSourceAniListId: proposal.immediateSourceAniListId,
    chainAnchorAniListId: proposal.chainAnchorAniListId,
  };

  if (contradictions.length > 0) {
    return {
      verdict: 'reject',
      details,
      ...(providerTitles[0] ? { title: providerTitles[0] } : {}),
    };
  }

  if (positiveSignals.length > 0) {
    return {
      verdict: 'accept',
      details,
      ...(providerTitles[0] ? { title: providerTitles[0] } : {}),
    };
  }

  return {
    verdict: 'ambiguous',
    details,
    ...(providerTitles[0] ? { title: providerTitles[0] } : {}),
  };
}
