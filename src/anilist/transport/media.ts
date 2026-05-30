/** AniList media endpoint operations built on the raw GraphQL transport. */
// src/anilist/transport/media.ts

import * as v from 'valibot';
import { logger } from '@/shared/utils/logger';
import { parseAniListIdOrNull } from '@/anilist/anilist-id';
import { AniListGraphqlError } from '@/anilist/transport/errors';
import {
  parseAniListMediaFormat,
  type AniListMedia,
  type AniListTitles,
} from '@/anilist/schemas/media.schema';
import { postAniList } from '@/anilist/transport/request';
import type { AniListResponseMeta } from '@/anilist/transport/types';
import type { AniListId } from '@/anilist/anilist-id';

const log = logger.create('AniListTransport');

const FIND_MEDIA_BATCH_QUERY = `
  query FindMediaBatch($ids: [Int!]) {
    Page(perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        format
        title { romaji english native }
        startDate { year }
        synonyms
        relations {
          edges {
            relationType(version: 2)
            node {
              id
              format
              title { romaji english native }
              startDate { year }
              synonyms
            }
          }
        }
        bannerImage
        coverImage {
          extraLarge
          large
          medium
          color
        }
        seasonYear
      }
    }
  }
`;

const AniListGraphQLErrorSchema = v.object({
  message: v.string(),
  status: v.optional(v.number()),
});

const FindMediaBatchTitleDtoSchema = v.object({
  romaji: v.optional(v.nullable(v.string())),
  english: v.optional(v.nullable(v.string())),
  native: v.optional(v.nullable(v.string())),
});

const FindMediaBatchTitleSchema = v.pipe(
  v.optional(v.nullable(FindMediaBatchTitleDtoSchema)),
  v.transform((titles): AniListTitles => {
    if (!titles) return {};

    const mapped: AniListTitles = {};
    if (titles.romaji) mapped.romaji = titles.romaji;
    if (titles.english) mapped.english = titles.english;
    if (titles.native) mapped.native = titles.native;
    return mapped;
  }),
);

const FindMediaBatchStartDateDtoSchema = v.object({
  year: v.optional(v.nullable(v.number())),
});

const FindMediaBatchStartDateSchema = v.optional(v.nullable(FindMediaBatchStartDateDtoSchema));

const FindMediaBatchSynonymsSchema = v.pipe(
  v.optional(v.nullable(v.array(v.unknown())), []),
  v.transform(values => (values ?? []).filter((value): value is string => typeof value === 'string')),
);

const FindMediaBatchFormatSchema = v.pipe(
  v.optional(v.nullable(v.string())),
  v.transform(value => parseAniListMediaFormat(value)),
);

const FindMediaBatchRelationNodeSchema = v.pipe(
  v.object({
    id: v.optional(v.nullable(v.number())),
    format: FindMediaBatchFormatSchema,
    title: FindMediaBatchTitleSchema,
    startDate: FindMediaBatchStartDateSchema,
    synonyms: FindMediaBatchSynonymsSchema,
  }),
  v.transform((node): AniListRelationNode | null => {
    const nodeId = parseAniListIdOrNull(node.id);
    if (nodeId === null) return null;

    const title = node.title ?? {};
    const synonyms = node.synonyms ?? [];
    return {
      id: nodeId,
      ...(node.format == null ? {} : { format: node.format }),
      ...(Object.keys(title).length > 0 ? { title } : {}),
      ...(node.startDate ? { startDate: node.startDate } : {}),
      ...(synonyms.length > 0 ? { synonyms } : {}),
    };
  }),
);

const FindMediaBatchRelationEdgeDtoSchema = v.object({
  relationType: v.optional(v.nullable(v.string())),
  node: v.optional(v.nullable(v.unknown())),
});

const FindMediaBatchRelationEdgeSchema = v.pipe(
  v.unknown(),
  v.transform((input): AniListRelationEdge | null => {
    const edgeResult = v.safeParse(FindMediaBatchRelationEdgeDtoSchema, input);
    if (!edgeResult.success) return null;

    const edge = edgeResult.output;
    if (typeof edge.relationType !== 'string' || !edge.node) return null;

    const nodeResult = v.safeParse(FindMediaBatchRelationNodeSchema, edge.node);
    if (!nodeResult.success || !nodeResult.output) return null;

    return {
      relationType: edge.relationType,
      node: nodeResult.output,
    };
  }),
);

const FindMediaBatchRelationsSchema = v.pipe(
  v.optional(v.nullable(v.object({
    edges: v.optional(v.nullable(v.array(FindMediaBatchRelationEdgeSchema))),
  }))),
  v.transform((relations): AniListMedia['relations'] | undefined => {
    if (!relations) return undefined;

    return {
      edges: (relations.edges ?? []).filter((edge): edge is AniListRelationEdge => edge !== null),
    };
  }),
);

const FindMediaBatchCoverImageSchema = v.object({
  extraLarge: v.optional(v.nullable(v.string())),
  large: v.optional(v.nullable(v.string())),
  medium: v.optional(v.nullable(v.string())),
  color: v.optional(v.nullable(v.string())),
});

const FindMediaBatchMediaSchema = v.pipe(
  v.object({
    id: v.optional(v.nullable(v.number())),
    format: FindMediaBatchFormatSchema,
    title: FindMediaBatchTitleSchema,
    startDate: FindMediaBatchStartDateSchema,
    synonyms: FindMediaBatchSynonymsSchema,
    relations: FindMediaBatchRelationsSchema,
    bannerImage: v.optional(v.nullable(v.string())),
    coverImage: v.optional(v.nullable(FindMediaBatchCoverImageSchema)),
    seasonYear: v.optional(v.nullable(v.number())),
  }),
  v.transform((item): AniListMedia | null => {
    const id = parseAniListIdOrNull(item.id);
    if (id === null) return null;

    return {
      id,
      format: item.format ?? null,
      title: item.title ?? {},
      ...(item.startDate ? { startDate: item.startDate } : {}),
      synonyms: item.synonyms ?? [],
      ...(item.relations ? { relations: item.relations } : {}),
      ...(item.bannerImage === undefined ? {} : { bannerImage: item.bannerImage }),
      ...(item.coverImage === undefined ? {} : { coverImage: item.coverImage }),
      ...(item.seasonYear === undefined ? {} : { seasonYear: item.seasonYear }),
    };
  }),
);

const AniListMediaPageSchema = v.object({
  media: v.optional(v.array(v.unknown()), []),
});

const AniListMediaResponseDataSchema = v.object({
  Page: v.optional(v.nullable(AniListMediaPageSchema)),
});

const FindMediaBatchResponseDtoSchema = v.object({
  data: v.optional(v.nullable(AniListMediaResponseDataSchema)),
  errors: v.optional(v.array(AniListGraphQLErrorSchema)),
});

type AniListGraphQLError = v.InferOutput<typeof AniListGraphQLErrorSchema>;
type AniListRelationNode = NonNullable<AniListMedia['relations']>['edges'][number]['node'];
type AniListRelationEdge = NonNullable<AniListMedia['relations']>['edges'][number];

const assertNoGraphqlErrors = (errors?: AniListGraphQLError[]): void => {
  if (errors?.length) {
    throw new AniListGraphqlError(errors);
  }
};

const getRawMediaId = (item: unknown): string => {
  if (!item || typeof item !== 'object') return 'unknown';
  const id = (item as { id?: unknown }).id;
  return typeof id === 'number' || typeof id === 'string' ? String(id) : 'unknown';
};

const parseFindMediaBatchItem = (input: unknown): AniListMedia | null => {
  const parsedMedia = v.safeParse(FindMediaBatchMediaSchema, input);
  return parsedMedia.success ? parsedMedia.output : null;
};

export async function fetchAniListMediaBatch(
  ids: AniListId[],
): Promise<{ data: AniListMedia[]; meta: AniListResponseMeta }> {
  const { payload, meta } = await postAniList({
    query: FIND_MEDIA_BATCH_QUERY,
    variables: { ids },
  });
  const parsedPayload = v.parse(FindMediaBatchResponseDtoSchema, payload);

  assertNoGraphqlErrors(parsedPayload.errors);

  const media: AniListMedia[] = [];
  for (const item of parsedPayload.data?.Page?.media ?? []) {
    const parsedItem = parseFindMediaBatchItem(item);
    if (parsedItem) {
      media.push(parsedItem);
      continue;
    }

    log.error(`findMediaBatch: dropped invalid media item id=${getRawMediaId(item)}`);
  }

  return {
    data: media,
    meta,
  };
}
