export type AniFormat =
  | 'TV'
  | 'TV_SHORT'
  | 'MOVIE'
  | 'SPECIAL'
  | 'OVA'
  | 'ONA'
  | 'MUSIC'
  | 'MANGA'
  | 'NOVEL'
  | 'ONE_SHOT';

export interface AniTitles {
  romaji?: string;
  english?: string;
  native?: string;
}

export interface MediaMetadataHint {
  titles?: AniTitles | null;
  synonyms?: string[] | null;
  startYear?: number | null;
  format?: AniFormat | null;
  relationPrequelIds?: number[] | null;
}

export type AniMedia = {
  id: number;
  format: AniFormat | null;
  title: AniTitles;
  startDate?: { year?: number | null };
  synonyms: string[];
  relations?: {
    edges: {
      relationType: string;
      node: AniMedia;
    }[];
  };
};
