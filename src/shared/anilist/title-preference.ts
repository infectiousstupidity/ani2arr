/** Resolves extension-owned AniList display titles and alternate labels from canonical AniList title data. */
// src/shared/anilist/title-preference.ts

import type { AniListTitles, AniListTitleLanguage } from '@/shared/types';

const LANGUAGE_ORDER: AniListTitleLanguage[] = ['english', 'romaji', 'native'];

const LANGUAGE_LABELS: Record<AniListTitleLanguage, string> = {
  english: 'English',
  romaji: 'Romaji',
  native: 'Native',
};

const normalizeTitle = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export interface ResolvedTitlePreference {
  primary: string;
  usedLanguage: AniListTitleLanguage | 'fallback';
  alternates: Array<{ label: string; value: string }>;
}

export const resolveTitlePreference = (params: {
  titles?: AniListTitles | null;
  preferred?: AniListTitleLanguage;
  fallback?: string | null;
}): ResolvedTitlePreference => {
  const preferred = params.preferred ?? 'english';
  const uniqueOrder = Array.from(new Set<AniListTitleLanguage>([preferred, ...LANGUAGE_ORDER]));
  const titleMap = params.titles ?? {};
  const fallbackTitle = normalizeTitle(params.fallback);

  let primary = '';
  let usedLanguage: AniListTitleLanguage | 'fallback' = 'fallback';

  for (const lang of uniqueOrder) {
    const candidate = normalizeTitle(titleMap?.[lang]);
    if (candidate) {
      primary = candidate;
      usedLanguage = lang;
      break;
    }
  }

  if (!primary && fallbackTitle) {
    primary = fallbackTitle;
    usedLanguage = 'fallback';
  }

  if (!primary) {
    primary = 'Unknown title';
  }

  const alternates = LANGUAGE_ORDER
    .filter(lang => lang !== usedLanguage)
    .map(lang => {
      const value = normalizeTitle(titleMap?.[lang]);
      return value && value !== primary ? { label: LANGUAGE_LABELS[lang], value } : null;
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);

  return { primary, usedLanguage, alternates };
};
