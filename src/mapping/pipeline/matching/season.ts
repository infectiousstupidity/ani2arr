/** Seasonal-suffix stripping helpers used when matching provider titles. */
// src/mapping/pipeline/matching/season.ts

import { stripParenContent } from './normalize';

const TRAILING_DESCRIPTOR_TOKENS = new Set(['season', 'part', 'cour', 'volume', 'vol', 'book', 'chapter']);

function cleanTitleDecorations(s: string): string {
  if (!s) return '';
  return s
    // Decorative CJK brackets
    .replaceAll(/[\u3008-\u3011\u3014\u3015]/g, '') // 【】「」『』〔〕〈〉《》
    // Fancy quotes range
    .replaceAll(/[\u2018-\u201F\u275B\u275C]/g, '')
    .replaceAll(/["']/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function isSeasonAnchor(token: string): boolean {
  const t = token.toLowerCase();
  return t === 'season' || t === 'part' || t === 'cour' || /^s\d+$/i.test(t) || /^season\d+$/i.test(t);
}

// Strips trailing season/part/cour suffixes like "Season 3", "Part 2", "2nd Season", "Cour II"
export function stripSeasonalSuffixes(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);

  // Find direct anchors first (season|part|cour|s\d+|season\d+)
  let cut = -1;
  for (const [i, token] of tokens.entries()) {
    const tok = token as string;
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
      if ((/^(?:\d+|\d+(?:st|nd|rd|th)|[cdilmvx]+)$/i.test(a)) && (b === 'season' || b === 'part' || b === 'cour')) {
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
export function stripTrailingOrdinalOrNumber(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);
  if (tokens.length <= 1) return trimmed;

  const removedTokens: string[] = [];
  while (tokens.length > 1) {
    const last = tokens.at(-1) as string;
    if (/^(?:\d+|\d+(?:st|nd|rd|th)|[cdilmvx]+)$/i.test(last)) {
      removedTokens.push(last);
      tokens.pop();
      continue;
    }
    break;
  }

  if (removedTokens.length > 0 && tokens.length > 0) {
    const trailing = tokens.at(-1)!.toLowerCase();
    if (TRAILING_DESCRIPTOR_TOKENS.has(trailing)) {
      tokens.pop();
    }
  }

  return tokens.join(' ').trim();
}

export function sanitizeLookupDisplay(term: string): string {
  if (!term) return '';
  let s = cleanTitleDecorations(term);

  // Preserve meaningful content inside ASCII square brackets by unwrapping instead of removing
  // Example: "[Oshi no Ko] 3rd Season" -> "Oshi no Ko 3rd Season"
  s = s.replaceAll(/\[([^\]]+)]/g, '$1');

  // Sonarr benefits from sequel/season cleanup before lookup.
  const seasonalReduced = stripSeasonalSuffixes(s);
  const trailingStripped = stripTrailingOrdinalOrNumber(seasonalReduced);

  // Finally, remove any remaining parenthetical/braced segments like (TV), {2024}
  const noParens = stripParenContent(trailingStripped);
  const normalized = noParens.replaceAll(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(normalized) ? normalized : '';
}
