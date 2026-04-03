/** Shared UI view-model types for overlays, browse cards, and mapping results. */
// src/shared/types/ui.ts

import type { AniListMediaHint } from '@/shared/schemas/anilist/anilist-media.schema';
import type { BadgeVisibility } from './options';
import type { Provider } from '@/shared/types/providers';
import type { RadarrFormState } from '@/shared/schemas/providers/radarr-settings.schema';
import type { SonarrFormState } from '@/shared/schemas/providers/sonarr-settings.schema';

export type AnchorCorner = 'bottom-left' | 'top-left';
export type StackDirection = 'up' | 'down';

export interface CardOverlayProps {
  provider: Provider;
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string, metadata: AniListMediaHint | null) => void;
  onOpenMappingFix?: (anilistId: number, title: string, mappingRequired?: boolean) => void;
  isConfigured: boolean;
  defaultForm: SonarrFormState | RadarrFormState | null;
  metadata: AniListMediaHint | null;
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
  // Overlay layout hints per surface
  anchorCorner?: AnchorCorner;
  stackDirection?: StackDirection;
  anchorOffsetX?: number; // px; default -8
}
