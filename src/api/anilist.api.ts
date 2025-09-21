/**
 * AniList GraphQL client with cached TVDB externalLink and enriched metadata.
 */
import type { CacheService } from '@/services/cache.service';
import { logError, normalizeError } from '@/utils/error-handling';

export type AniTitles = { romaji?: string; english?: string; native?: string };

type AniListResponse = {
  data?: {
    Media?: {
      title?: AniTitles;
      startDate?: { year?: number | null } | null;
      synonyms?: string[] | null;
      externalLinks?: Array<{ id?: string | number | null; url?: string | null; site?: string | null }> | null;
    };
  };
};

export class AnilistApiService {
  private readonly API_URL = 'https://graphql.anilist.co';
  private readonly STALE = 30 * 24 * 60 * 60 * 1000;         // 30d soft
  private readonly HARD  = 180 * 24 * 60 * 60 * 1000;        // 180d hard

  constructor(private readonly cache: CacheService) {}

  public async findTvdbId(
    anilistId: number
  ): Promise<{ tvdbId: number | null; synonyms: string[]; titles: AniTitles; startYear?: number }> {
    const cacheKey = `tvdb_id:${anilistId}`;
    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== null) {
      return { tvdbId: cached, synonyms: [] as string[], titles: {} };
    }

    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          title { romaji english native }
          startDate { year }
          synonyms
          externalLinks { id url site }
        }
      }
    `;

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { id: anilistId } }),
      });
      if (!response.ok) throw new Error(`AniList API ${response.status}`);

      const result = (await response.json()) as AniListResponse;
      const media = result?.data?.Media;

      const titles: AniTitles = media?.title ?? {};
      const startYearRaw = media?.startDate?.year ?? undefined;
      const startYear = typeof startYearRaw === 'number' ? startYearRaw : undefined;
      const synonyms: string[] = Array.isArray(media?.synonyms) ? media!.synonyms as string[] : [];

      const links = Array.isArray(media?.externalLinks) ? media!.externalLinks! : [];
      const tvdbLink = links.find(l => l?.site === 'TheTVDB');

      let tvdbId: number | null = null;
      if (tvdbLink && tvdbLink.id !== null && tvdbLink.id !== undefined) {
        const raw = tvdbLink.id;
        const num = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
        if (Number.isFinite(num)) tvdbId = num;
      }

      if (tvdbId !== null) {
        await this.cache.set(cacheKey, tvdbId, this.STALE, this.HARD);
        return { tvdbId, synonyms, titles, ...(startYear !== undefined ? { startYear } : {}) };
      }

      return { tvdbId: null, synonyms, titles, ...(startYear !== undefined ? { startYear } : {}) };
    } catch (e) {
      logError(normalizeError(e), 'AnilistApiService:findTvdbId');
      return { tvdbId: null, synonyms: [] as string[], titles: {} };
    }
  }
}
