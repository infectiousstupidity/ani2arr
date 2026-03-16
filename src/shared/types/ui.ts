import type { MediaMetadataHint } from './anilist';
import type { BadgeVisibility, RadarrFormState, SonarrFormState } from './options';
import type { MediaService } from './providers';
import type { MappingExternalId } from './mapping';

export type AnchorCorner = 'bottom-left' | 'top-left';
export type StackDirection = 'up' | 'down';

export interface CardOverlayProps {
  service: MediaService;
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string, metadata: MediaMetadataHint | null) => void;
  onOpenMappingFix?: (anilistId: number, title: string, mappingRequired?: boolean) => void;
  isConfigured: boolean;
  defaultForm: SonarrFormState | RadarrFormState | null;
  metadata: MediaMetadataHint | null;
  providerUrl: string | null;
  observeTarget?: Element | null;
  badgeVisibility?: BadgeVisibility;
  /** Corner for anchor placement */
  anchorCorner?: AnchorCorner;
  /** Direction the action stack animates */
  stackDirection?: StackDirection;
  /** Horizontal offset to align with native rank badge (px). Defaults to -8. */
  anchorOffsetX?: number;
}

export interface ParsedCard {
  anilistId: number;
  title: string;
  host: HTMLElement;
  metadata: MediaMetadataHint | null;
}

export interface BrowseAdapter {
  cardSelector: string;
  containerClassName?: string;
  processedAttribute?: string;
  parseCard(card: Element): ParsedCard | null;
  ensureContainer?(host: HTMLElement, card: Element): HTMLElement;
  getContainerForCard?(card: Element): HTMLElement | null;
  markProcessed?(host: HTMLElement, parsed: ParsedCard): void;
  clearProcessed?(host: HTMLElement): void;
  onCardInvalid?(card: Element): void;
  getObserverRoot?(): Node | null;
  getScanRoot?(): Element | null;
  mutationObserverInit?: MutationObserverInit;
  resizeObserverTargets?: () => Iterable<Element> | Element | null;
  // Overlay layout hints per surface
  anchorCorner?: AnchorCorner;
  stackDirection?: StackDirection;
  anchorOffsetX?: number; // px; default -8
}

// Normalized view model for search results and current mapping preview
export interface MappingSearchResult {
  service: MediaService;
  target: MappingExternalId;
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
  alternateTitles?: string[];
  // For listing or preview
  episodeOrMovieCount?: number; // Total episodes in series
  fileCount?: number;           // Downloaded episodes
  // Multi AniList mapping info
  linkedAniListIds?: number[];
}
