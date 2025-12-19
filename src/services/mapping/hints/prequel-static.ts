import type { AnilistApiService } from '@/clients/anilist.api';
import type { AniMedia } from '@/shared/types';
import type { StaticMappingProvider } from '../static-mapping.provider';
import type { ResolvedMapping } from '../types';

export async function resolvePrequelStatic(
  media: AniMedia,
  staticProvider: StaticMappingProvider,
  anilistApi: AnilistApiService,
): Promise<ResolvedMapping | null> {
  const directHit = staticProvider.get(media.id);
  if (directHit) {
    return { tvdbId: directHit.tvdbId };
  }

  const visited = new Set<number>([media.id]);

  for await (const prequel of anilistApi.iteratePrequelChain(media)) {
    if (visited.has(prequel.id)) {
      continue;
    }
    const hit = staticProvider.get(prequel.id);
    if (hit) {
      return { tvdbId: hit.tvdbId };
    }
    visited.add(prequel.id);
  }

  return null;
}
