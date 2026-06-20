/** Browse card and adapter contracts owned by content-surface overlays. */
// src/content/browse/types.ts

import type { AniListId, AniListMediaFormat } from '@/anilist/types';
import type { SourceIdentity } from '@/mapping/types';

export const BROWSE_OVERLAY_CONTAINER_CLASS = 'a2a-overlay-container';
export const BROWSE_PROCESSED_ATTRIBUTE = 'data-a2a-processed';

type AnchorCorner = 'bottom-left' | 'top-left';
type StackDirection = 'up' | 'down';

export interface HostMediaTarget {
  source: SourceIdentity;
  anilistId?: AniListId;
  title: string;
  format: AniListMediaFormat | null;
  mountTarget: HTMLElement;
}

export interface BrowseAdapter {
  cardSelector: string;
  parseCard(card: Element): HostMediaTarget | null;
  getObserverRoot?(): Node | null;
  getScanRoot?(): Element | null;
  anchorCorner?: AnchorCorner;
  stackDirection?: StackDirection;
}
