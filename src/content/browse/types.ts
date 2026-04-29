/** Browse card and adapter contracts owned by content-surface overlays. */
// src/content/browse/types.ts

import type { AniListId } from '@/anilist';
import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';

type AnchorCorner = 'bottom-left' | 'top-left';
type StackDirection = 'up' | 'down';

export interface HostMediaTarget {
  anilistId: AniListId;
  format: AniListMediaFormat | null;
  mountTarget: HTMLElement;
}

export interface BrowseAdapter {
  cardSelector: string;
  containerClassName?: string;
  processedAttribute?: string;
  parseCard(card: Element): HostMediaTarget | null;
  ensureContainer?(mountTarget: HTMLElement, card: Element): HTMLElement;
  getContainerForCard?(card: Element): HTMLElement | null;
  markProcessed?(mountTarget: HTMLElement, parsed: HostMediaTarget): void;
  clearProcessed?(mountTarget: HTMLElement): void;
  onCardInvalid?(card: Element): void;
  getObserverRoot?(): Node | null;
  getScanRoot?(): Element | null;
  mutationObserverInit?: MutationObserverInit;
  resizeObserverTargets?: () => Iterable<Element> | Element | null;
  anchorCorner?: AnchorCorner;
  stackDirection?: StackDirection;
  anchorOffsetX?: number;
}
