import type { AniListSearchResult, AniMedia } from '@/shared/types';
import type { createError } from '@/shared/utils/error-handling';

export type GraphQLError = { message: string; status?: number };

export type ExtensionErrorLike = ReturnType<typeof createError>;
export type ReturnTypeOfCreateError = ExtensionErrorLike;

export type FindMediaResponse = {
  data?: { Media?: AniMedia };
  errors?: GraphQLError[];
};

export type FindMediaBatchResponse = {
  data?: { Page?: { media?: AniMedia[] } };
  errors?: GraphQLError[];
};

export type SearchMediaResponse = {
  data?: { Page?: { media?: AniListSearchResult[] } };
  errors?: GraphQLError[];
};
