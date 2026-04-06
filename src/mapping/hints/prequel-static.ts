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
  const visited = new Set<number>([media.id]);
  let chainAnchorAniListId: number | undefined;

  for await (const prequel of anilistApi.iteratePrequelChain(media)) {
    if (visited.has(prequel.id)) {
      continue;
    }
    chainAnchorAniListId ??= prequel.id;
    const hit = upstreamMappingStore.get(prequel.id);
    if (hit) {
      return {
        providerId: hit.tvdbId,
        reason: 'verified-inherited',
        immediateSourceAniListId: prequel.id,
        ...(chainAnchorAniListId ? { chainAnchorAniListId } : {}),
      };
    }
    visited.add(prequel.id);
  }

  return null;
}
