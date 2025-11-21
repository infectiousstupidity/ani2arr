import type { MediaService } from './common';

// What we store/compare as the mapping target id
export interface MappingTargetId {
  id: number | string; // TVDB/TMDB/IMDb ids
  idType: 'tvdb' | 'tmdb' | 'imdb';
}

// Normalized view model for search results and current mapping preview
export interface MappingSearchResult {
  service: MediaService;

  target: MappingTargetId;

  title: string;
  year?: number;

  // "Anime", "Standard", "Movie" etc. For UI labels only.
  typeLabel?: string;

  // Whether the item is already in the external library
  inLibrary: boolean;
  librarySlug?: string; // /series/:slug or /movie/:slug

  // Poster/backdrop to show in UI
  posterUrl?: string;
  backdropUrl?: string;

  statusLabel?: string; // "Continuing", "Ended", "Announced"
  networkOrStudio?: string;
  overview?: string;
  imdbId?: string;
  alternateTitles?: string[];

  // For listing or preview
  episodeOrMovieCount?: number; // Total episodes in series
  fileCount?: number;           // Downloaded episodes

  // Multi AniList mapping info
  linkedAniListIds?: number[];
}