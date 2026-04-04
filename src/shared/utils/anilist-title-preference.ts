/** Resolves AniList display titles and canonical title-language labels for UI callers. */
// src/shared/utils/anilist-title-preference.ts

import type { AniListTitleLanguage } from '@/shared/schemas/anilist/anilist-title-language.schema';
import type { AniListTitles } from '@/shared/schemas/anilist/anilist-media.schema';

const TITLE_LANGUAGE_ORDER: AniListTitleLanguage[] = ['english', 'romaji', 'native'];

export const ANILIST_TITLE_LANGUAGE_LABELS: Readonly<Record<AniListTitleLanguage, string>> = {
  english: 'English',
  romaji: 'Romaji',
  native: 'Native',
};

const normalizeTitle = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getAniListTitleLanguageLabel = (
  language: AniListTitleLanguage,
  options?: { includeDefaultSuffix?: boolean },
): string => {
  const label = ANILIST_TITLE_LANGUAGE_LABELS[language];
  if (options?.includeDefaultSuffix && language === 'english') {
    return `${label} (default)`;
  }
  return label;
};

export const resolveTitlePreference = (params: {
  titles?: AniListTitles | null;
  preferred?: AniListTitleLanguage;
  fallback?: string | null;
}): {
  primary: string;
  usedLanguage: AniListTitleLanguage | 'fallback';
  alternates: Array<{ label: string; value: string }>;
} => {
  const preferred = params.preferred ?? 'english';
  const uniqueOrder = [...new Set<AniListTitleLanguage>([preferred, ...TITLE_LANGUAGE_ORDER])];
  const titleMap = params.titles ?? {};
  const fallbackTitle = normalizeTitle(params.fallback);

  let primary = '';
  let usedLanguage: AniListTitleLanguage | 'fallback' = 'fallback';

  for (const language of uniqueOrder) {
    const candidate = normalizeTitle(titleMap?.[language]);
    if (candidate) {
      primary = candidate;
      usedLanguage = language;
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

  const alternates = TITLE_LANGUAGE_ORDER
    .filter(language => language !== usedLanguage)
    .map(language => {
      const value = normalizeTitle(titleMap?.[language]);
      return value && value !== primary ? { label: getAniListTitleLanguageLabel(language), value } : null;
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);

  return { primary, usedLanguage, alternates };
};
