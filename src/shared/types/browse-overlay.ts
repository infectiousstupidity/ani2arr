import type { MediaMetadataHint } from './anilist';
import type { SonarrFormState } from './extension';

export interface CardOverlayProps {
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string, metadata: MediaMetadataHint | null) => void;
  onOpenMappingFix?: (anilistId: number, title: string, overrideActive?: boolean) => void;
  isConfigured: boolean;
  defaultForm: SonarrFormState | null;
  metadata: MediaMetadataHint | null;
  sonarrUrl: string | null;
  observeTarget?: Element | null;
  /** Corner for anchor placement */
  anchorCorner?: 'bottom-left' | 'top-left';
  /** Direction the action stack animates */
  stackDirection?: "up" | "down";
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
  anchorCorner?: 'bottom-left' | 'top-left';
  stackDirection?: 'up' | 'down';
  anchorOffsetX?: number; // px; default -8
}
