/** Canonical AniList title-language schema and derived type shared across settings and UI. */
// src/shared/schemas/anilist-title-language.schema.ts

import * as v from 'valibot';

export const ANILIST_TITLE_LANGUAGES = ['english', 'romaji', 'native'] as const;

export const AniListTitleLanguageSchema = v.picklist(ANILIST_TITLE_LANGUAGES);

export type AniListTitleLanguage = v.InferOutput<typeof AniListTitleLanguageSchema>;

export const isAniListTitleLanguage = (value: unknown): value is AniListTitleLanguage =>
  typeof value === 'string' && ANILIST_TITLE_LANGUAGES.includes(value as AniListTitleLanguage);
