/** AniList media endpoint operations built on the raw GraphQL transport. */
// src/integrations/anilist/media.ts

import type { AniListMedia } from '@/shared/types';
import { AniListGraphqlError } from '@/integrations/anilist/errors';
import {
  FIND_MEDIA_BATCH_QUERY,
  SEARCH_MEDIA_QUERY,
} from '@/integrations/anilist/queries';
import { postAniList } from '@/integrations/anilist/request';
import type {
  AniListGraphQLError,
  AniListResponseMeta,
  AniListSearchMediaDto,
  FindMediaBatchResponseDto,
  SearchMediaResponseDto,
} from '@/integrations/anilist/types';

export interface AniListMediaResult<TData> {
  data: TData;
  meta: AniListResponseMeta;
}

const assertNoGraphqlErrors = (errors?: AniListGraphQLError[]): void => {
  if (errors?.length) {
    throw new AniListGraphqlError(errors);
  }
};

export async function fetchAniListMediaBatch(ids: number[]): Promise<AniListMediaResult<AniListMedia[]>> {
  const { payload, meta } = await postAniList<FindMediaBatchResponseDto, { ids: number[] }>({
    query: FIND_MEDIA_BATCH_QUERY,
    variables: { ids },
  });

  assertNoGraphqlErrors(payload?.errors);

  const media = payload?.data?.Page?.media ?? [];
  return {
    data: media.filter((item): item is AniListMedia => Boolean(item && typeof item.id === 'number')),
    meta,
  };
}

export async function searchAniListMedia(
  search: string,
  limit: number,
): Promise<AniListMediaResult<AniListSearchMediaDto[]>> {
  const { payload, meta } = await postAniList<SearchMediaResponseDto, { search: string; perPage: number }>({
    query: SEARCH_MEDIA_QUERY,
    variables: { search, perPage: limit },
  });

  assertNoGraphqlErrors(payload?.errors);

  const results = payload?.data?.Page?.media ?? [];
  return {
    data: results
      .filter((item): item is AniListSearchMediaDto => typeof item?.id === 'number' && Number.isFinite(item.id))
      .map(item => ({
        id: item.id,
        title: item.title ?? {},
        coverImage: item.coverImage ?? null,
        format: item.format ?? null,
        status: item.status ?? null,
      })),
    meta,
  };
}
