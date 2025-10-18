import type { MediaMetadataHint } from './anilist';
import type { SonarrFormState } from './extension';

export type ModalState = {
  anilistId: number;
  title: string;
  metadata: MediaMetadataHint | null;
};

export interface CardOverlayProps {
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string, metadata: MediaMetadataHint | null) => void;
  isConfigured: boolean;
  defaultForm: SonarrFormState | null;
  metadata: MediaMetadataHint | null;
  sonarrUrl: string | null;
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
}
