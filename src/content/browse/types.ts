/** Browse card and adapter contracts owned by content-surface overlays. */
// src/content/browse/types.ts

import type { AniListMediaHint } from '@/anilist/schemas/media.schema';

type AnchorCorner = 'bottom-left' | 'top-left';
type StackDirection = 'up' | 'down';

export interface ParsedCard {
  anilistId: number;
  title: string;
  host: HTMLElement;
  metadata: AniListMediaHint | null;
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
  anchorCorner?: AnchorCorner;
  stackDirection?: StackDirection;
  anchorOffsetX?: number;
}
