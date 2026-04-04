/** Static prequel-chain resolution against upstream AniList mappings. */
// src/mapping/hints/prequel-static.ts

import type { AniListMediaService } from '@/anilist';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import type { UpstreamMappingStore } from '../upstream';
import type { ResolvedMapping } from '../types';

export async function resolvePrequelStatic(
  media: AniListMedia,
  upstreamMappingStore: UpstreamMappingStore,
  anilistApi: AniListMediaService,
): Promise<ResolvedMapping | null> {
  const directHit = upstreamMappingStore.get(media.id);
  if (directHit) {
    return { externalId: { id: directHit.tvdbId, kind: 'tvdb' } };
  }

  const visited = new Set<number>([media.id]);

  for await (const prequel of anilistApi.iteratePrequelChain(media)) {
    if (visited.has(prequel.id)) {
      continue;
    }
    const hit = upstreamMappingStore.get(prequel.id);
    if (hit) {
      return { externalId: { id: hit.tvdbId, kind: 'tvdb' } };
    }
    visited.add(prequel.id);
  }

  return null;
}
