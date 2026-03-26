/** AniList transport response wrappers and executor-facing payload types. */
// src/clients/anilist/types.ts

import type {
  AniListGraphQLError,
  AniListMediaDto,
  AniListMediaPage,
  AniListSearchPage,
} from '@/integrations/anilist/types';
import type { createError } from '@/shared/errors/error-utils';

export type ExtensionErrorLike = ReturnType<typeof createError>;
export type ReturnTypeOfCreateError = ExtensionErrorLike;

export type FindMediaResponse = {
  data?: { Media?: AniListMediaDto };
  errors?: AniListGraphQLError[];
};

export type FindMediaBatchResponse = {
  data?: { Page?: AniListMediaPage };
  errors?: AniListGraphQLError[];
};

export type SearchMediaResponse = {
  data?: { Page?: AniListSearchPage };
  errors?: AniListGraphQLError[];
};
