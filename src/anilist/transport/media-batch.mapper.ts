/** Transport-local mapping from raw AniList batch DTOs to canonical media objects. */
// src/anilist/transport/media-batch.mapper.ts

import * as v from 'valibot';
import { isAniListId, parseAniListIdOrNull, type AniListId } from '@/anilist/anilist-id';
import {
  AniListMediaSchema,
  ANILIST_MEDIA_FORMATS,
  ANILIST_MEDIA_STATUSES,
  ANILIST_MEDIA_SEASONS,
  type AniListMedia,
  type AniListTitles,
} from '@/anilist/schemas/media.schema';
import {
  FindMediaBatchMediaDtoSchema,
  type FindMediaBatchMediaDto,
} from '@/anilist/transport/media-response.schema';

export type FindMediaBatchItemMappingResult =
  | { success: true; media: AniListMedia }
  | { success: false; id: AniListId | null; stage: 'dto' | 'canonical'; issues: unknown[] };

const mapTitles = (titles?: FindMediaBatchMediaDto['title'] | null): AniListTitles => {
  if (!titles) {
    return {};
  }

  const mapped: AniListTitles = {};
  if (typeof titles.romaji === 'string') mapped.romaji = titles.romaji;
  if (typeof titles.english === 'string') mapped.english = titles.english;
  if (typeof titles.native === 'string') mapped.native = titles.native;
  return mapped;
};

const mapStringArray = (values?: unknown[] | null) => {
  if (values === undefined) return;
  if (values === null) return null;
  return values.flatMap(value => (typeof value === 'string' ? [value] : []));
};

// Both fields are required in the canonical schema; null in either discards the object.
// Returns undefined (not null) when the field is absent to avoid phantom output keys.
const mapNextAiringEpisode = (nae?: FindMediaBatchMediaDto['nextAiringEpisode'] | null) => {
  if (nae === undefined) return;
  if (nae === null || typeof nae.episode !== 'number' || typeof nae.airingAt !== 'number') return null;
  return { episode: nae.episode, airingAt: nae.airingAt };
};

// Unknown enum values are coerced to null rather than failing the whole item.
const mapEnum = <T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null | undefined => {
  if (value === undefined) return;
  if (value === null) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
};

// Null studio nodes in the array are dropped to satisfy the canonical schema.
const mapStudios = (studios?: FindMediaBatchMediaDto['studios'] | null) => {
  if (studios == null) return studios;
  const nodes = (studios.nodes ?? []).flatMap(node => (node ? [node] : []));
  return { nodes };
};

const mapStartDate = (startDate?: FindMediaBatchMediaDto['startDate'] | null) => {
  if (startDate === undefined) return;
  if (startDate === null) return null;
  return typeof startDate.year === 'number' ? { year: startDate.year } : {};
};

type RelationNodeDto = NonNullable<
  NonNullable<
    NonNullable<FindMediaBatchMediaDto['relations']>['edges']
  >[number]
>['node'];

const mapRelationNode = (node?: RelationNodeDto | null) => {
  if (!node) return null;
  const nodeId = node.id;
  if (!isAniListId(nodeId)) return null;

  const format = mapEnum(node.format, ANILIST_MEDIA_FORMATS);
  const title = mapTitles(node.title);
  const synonyms = mapStringArray(node.synonyms);
  const startDate = mapStartDate(node.startDate);

  return {
    id: nodeId,
    ...(format !== undefined && { format }),
    ...(Object.keys(title).length > 0 && { title }),
    ...(startDate !== undefined && startDate !== null && { startDate }),
    ...(synonyms !== undefined && synonyms !== null && { synonyms }),
  };
};

// Null edges, null relationType, and null/invalid nodes are dropped defensively.
const mapRelations = (relations?: FindMediaBatchMediaDto['relations'] | null) => {
  if (!relations) return;
  const edges = (relations.edges ?? []).flatMap(edge => {
    if (!edge || typeof edge.relationType !== 'string') return [];
    const node = mapRelationNode(edge.node);
    if (!node) return [];
    return [{ relationType: edge.relationType, node }];
  });
  return { edges };
};

const extractAniListId = (input: unknown): AniListId | null => {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const id = (input as { id?: unknown }).id;
  return isAniListId(id) ? id : null;
};

const toCanonicalCandidate = (media: FindMediaBatchMediaDto) => {
  const relations = mapRelations(media.relations);
  const nextAiringEpisode = mapNextAiringEpisode(media.nextAiringEpisode);
  const format = mapEnum(media.format, ANILIST_MEDIA_FORMATS);
  const status = mapEnum(media.status, ANILIST_MEDIA_STATUSES);
  const season = mapEnum(media.season, ANILIST_MEDIA_SEASONS);
  const studios = mapStudios(media.studios);
  const synonyms = mapStringArray(media.synonyms);
  const genres = mapStringArray(media.genres);
  return {
    ...media,
    title: mapTitles(media.title),
    ...(synonyms !== undefined && { synonyms }),
    ...(relations !== undefined && { relations }),
    ...(nextAiringEpisode !== undefined && { nextAiringEpisode }),
    ...(format !== undefined && { format }),
    ...(status !== undefined && { status }),
    ...(season !== undefined && { season }),
    ...(genres !== undefined && { genres }),
    ...(studios !== undefined && { studios }),
  };
};

export const mapFindMediaBatchItem = (input: unknown): FindMediaBatchItemMappingResult => {
  const parsedDto = v.safeParse(FindMediaBatchMediaDtoSchema, input);
  if (!parsedDto.success) {
    return {
      success: false,
      id: extractAniListId(input),
      stage: 'dto',
      issues: [...parsedDto.issues],
    };
  }

  const parsedMedia = v.safeParse(AniListMediaSchema, toCanonicalCandidate(parsedDto.output));
  if (!parsedMedia.success) {
    return {
      success: false,
      id: parseAniListIdOrNull(parsedDto.output.id),
      stage: 'canonical',
      issues: [...parsedMedia.issues],
    };
  }

  return {
    success: true,
    media: parsedMedia.output,
  };
};
