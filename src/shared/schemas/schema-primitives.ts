import * as v from 'valibot';
import type { ProviderTitleLanguage } from '@/shared/types/options';

// --- Shared Constants ---

export const TITLE_LANGUAGES: [ProviderTitleLanguage, ...ProviderTitleLanguage[]] = [
  'english',
  'romaji',
  'native',
];

// --- Reusable Coercion Schemas ---

/** Trims strings, falls back to empty string. */
export const SafeString = v.fallback(
  v.pipe(v.string(), v.transform((s) => s.trim())),
  ''
);

/** Handles number | string -> number | ''. */
export const CoerceQualityProfileId = v.pipe(
  v.unknown(),
  v.transform((input): number | '' => {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string' && input.trim().length > 0) {
      const parsed = Number(input);
      return Number.isFinite(parsed) ? parsed : '';
    }
    return '';
  })
);

/** Handles array | single item -> array. Filters invalid numbers. */
export const CoerceNumberArray = v.pipe(
  v.unknown(),
  v.transform((input) => {
    const list = Array.isArray(input) ? input : [input];
    return list.reduce<number[]>((acc, item) => {
      const num = Number(item);
      if (Number.isFinite(num)) acc.push(num);
      return acc;
    }, []);
  }),
  v.array(v.number())
);

/** Handles array | single item -> array. Trims and filters empty strings. */
export const CoerceStringArray = v.pipe(
  v.unknown(),
  v.transform((input) => {
    const list = Array.isArray(input) ? input : [input];
    return list.reduce<string[]>((acc, item) => {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) acc.push(trimmed);
      }
      return acc;
    }, []);
  }),
  v.array(v.string())
);
