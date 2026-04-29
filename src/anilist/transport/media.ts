/** AniList media endpoint operations built on the raw GraphQL transport. */
// src/anilist/transport/media.ts

import * as v from 'valibot';
import { logger } from '@/shared/utils/logger';
import { AniListGraphqlError } from '@/anilist/transport/errors';
import { mapFindMediaBatchItem } from '@/anilist/transport/media-batch.mapper';
import {
  FindMediaBatchResponseDtoSchema,
  type AniListGraphQLError,
} from '@/anilist/transport/media-response.schema';
import {
  FIND_MEDIA_BATCH_QUERY,
} from '@/anilist/transport/queries';
import { postAniList } from '@/anilist/transport/request';
import type { AniListResponseMeta } from '@/anilist/transport/types';
import type { AniListId } from '@/anilist/anilist-id';
import type { AniListMedia } from '@/anilist/schemas/media.schema';

const log = logger.create('AniListTransport');

const assertNoGraphqlErrors = (errors?: AniListGraphQLError[]): void => {
  if (errors?.length) {
    throw new AniListGraphqlError(errors);
  }
};

export async function fetchAniListMediaBatch(
  ids: AniListId[],
): Promise<{ data: AniListMedia[]; meta: AniListResponseMeta }> {
  const { payload, meta } = await postAniList<unknown, { ids: AniListId[] }>({
    query: FIND_MEDIA_BATCH_QUERY,
    variables: { ids },
  });
  const parsedPayload = v.parse(FindMediaBatchResponseDtoSchema, payload);

  assertNoGraphqlErrors(parsedPayload.errors);

  const media: AniListMedia[] = [];
  for (const item of parsedPayload.data?.Page?.media ?? []) {
    const mappedItem = mapFindMediaBatchItem(item);
    if (mappedItem.success) {
      media.push(mappedItem.media);
      continue;
    }

    const idLabel = mappedItem.id === null ? 'unknown' : String(mappedItem.id);
    log.error(
      `findMediaBatch: dropped invalid media item id=${idLabel} stage=${mappedItem.stage}`,
      mappedItem.issues,
    );
  }

  return {
    data: media,
    meta,
  };
}
