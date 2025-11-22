import type { AniTitles, TitleLanguage } from '@/shared/types';

const LANGUAGE_ORDER: TitleLanguage[] = ['english', 'romaji', 'native'];

const LANGUAGE_LABELS: Record<TitleLanguage, string> = {
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
  usedLanguage: TitleLanguage | 'fallback';
  alternates: Array<{ label: string; value: string }>;
}

export const resolveTitlePreference = (params: {
  titles?: AniTitles | null;
  preferred?: TitleLanguage;
  fallback?: string | null;
}): ResolvedTitlePreference => {
  const preferred = params.preferred ?? 'english';
  const uniqueOrder = Array.from(new Set<TitleLanguage>([preferred, ...LANGUAGE_ORDER]));
  const titleMap = params.titles ?? {};
  const fallbackTitle = normalizeTitle(params.fallback);

  let primary = '';
  let usedLanguage: TitleLanguage | 'fallback' = 'fallback';

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
