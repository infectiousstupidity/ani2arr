// src/api/anilist.api.ts

import { logError, normalizeError } from '@/utils/error-handling';
import type { ExtensionError } from '@/types';

export type AniTitles = { romaji?: string; english?: string; native?: string };
export type AniFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

export type AniMedia = {
  id: number;
  format: AniFormat | null;
  title: AniTitles;
  startDate?: { year?: number | null; };
  synonyms: string[];
  externalLinks: { id?: string | number | null; url?: string | null; site?: string | null; }[];
  relations?: {
    edges: {
      relationType: string;
      node: AniMedia;
    }[];
  };
};

type FindMediaResponse = {
  data?: { Media?: AniMedia; };
  errors?: { message: string; status: number; }[];
};

type QueuedRequest = {
  anilistId: number;
  resolve: (value: AniMedia) => void;
  reject: (reason: Error | ExtensionError) => void;
};

export class AnilistApiService {
  private readonly API_URL = 'https://graphql.anilist.co';
  
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private readonly BATCH_SIZE = 5;
  private readonly BATCH_DELAY_MS = 1000;
  private inflight = new Map<number, Promise<AniMedia>>();

  private readonly findMediaWithRelationsQuery = `
    query FindRoot($id: Int) {
      Media(id: $id) {
        id
        format
        title { romaji english native }
        startDate { year }
        synonyms
        externalLinks { id url site }
        relations {
          edges {
            relationType
            node {
              id
              relations {
                edges {
                  relationType
                  node {
                    id
                    relations {
                      edges {
                        relationType
                        node {
                          id
                          relations {
                            edges {
                              relationType
                              node { id }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  
  constructor() {}

  public fetchMediaWithRelations(anilistId: number): Promise<AniMedia> {
    if (this.inflight.has(anilistId)) {
      return this.inflight.get(anilistId)!;
    }
    
    const promise = new Promise<AniMedia>((resolve, reject) => {
      this.requestQueue.push({ anilistId, resolve, reject });
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });

    this.inflight.set(anilistId, promise);
    return promise;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const batch = this.requestQueue.splice(0, this.BATCH_SIZE);
      
      await Promise.allSettled(batch.map(async (req) => {
        try {
          const result = await this.fetchFromApi(req.anilistId);
          req.resolve(result);
        } catch (e) {
          req.reject(normalizeError(e));
        }
      }));

      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY_MS));
      }
    }

    this.isProcessingQueue = false;
  }

  private async fetchFromApi(anilistId: number): Promise<AniMedia> {
    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: this.findMediaWithRelationsQuery, variables: { id: anilistId } }),
      });

      if (!response.ok) throw new Error(`AniList API Error: ${response.status}`);
      const result = (await response.json()) as FindMediaResponse;
      
      const media = result?.data?.Media;
      if (!media) {
        if (result.errors) {
          throw new Error(`GraphQL Error: ${result.errors.map(e => e.message).join(', ')}`);
        }
        throw new Error('No media data returned from AniList API.');
      }
      
      return media as AniMedia;

    } catch (e) {
      logError(normalizeError(e), `AnilistApiService:fetchFromApi:${anilistId}`);
      throw e;
    } finally {
      this.inflight.delete(anilistId);
    }
  }
}