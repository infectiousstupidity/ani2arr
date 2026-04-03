/** AniList media endpoint operations built on the raw GraphQL transport. */
// src/integrations/anilist/media.ts

import * as v from 'valibot';
import { AniListGraphqlError } from '@/integrations/anilist/errors';
import {
  FindMediaBatchResponseDtoSchema,
  SearchMediaResponseDtoSchema,
  type AniListGraphQLError,
  type AniListSearchMediaDto,
} from '@/integrations/anilist/media.schema';
import {
  FIND_MEDIA_BATCH_QUERY,
  SEARCH_MEDIA_QUERY,
} from '@/integrations/anilist/queries';
import { postAniList } from '@/integrations/anilist/request';
import type { AniListResponseMeta } from '@/integrations/anilist/types';
import type { AniListMedia } from '@/shared/schemas/anilist/anilist-media.schema';

const assertNoGraphqlErrors = (errors?: AniListGraphQLError[]): void => {
  if (errors?.length) {
    throw new AniListGraphqlError(errors);
  }
};

export async function fetchAniListMediaBatch(
  ids: number[],
): Promise<{ data: AniListMedia[]; meta: AniListResponseMeta }> {
  const { payload, meta } = await postAniList<unknown, { ids: number[] }>({
    query: FIND_MEDIA_BATCH_QUERY,
    variables: { ids },
  });
  const parsedPayload = v.parse(FindMediaBatchResponseDtoSchema, payload);

  assertNoGraphqlErrors(parsedPayload.errors);

  const media = parsedPayload.data?.Page?.media ?? [];
  return {
    data: media,
    meta,
  };
}

export async function searchAniListMedia(
  search: string,
  limit: number,
): Promise<{ data: AniListSearchMediaDto[]; meta: AniListResponseMeta }> {
  const { payload, meta } = await postAniList<unknown, { search: string; perPage: number }>({
    query: SEARCH_MEDIA_QUERY,
    variables: { search, perPage: limit },
  });
  const parsedPayload = v.parse(SearchMediaResponseDtoSchema, payload);

  assertNoGraphqlErrors(parsedPayload.errors);

  const results = parsedPayload.data?.Page?.media ?? [];
  return {
    data: results,
    meta,
  };
}
