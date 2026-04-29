/** AniList browse surface adapter for card parsing and portal placement. */
// src/content/anilist/browse/adapter.ts

import { parseAniListIdOrNull } from '@/anilist/anilist-id';
import { parseAniListMediaFormatLabel } from '@/anilist/schemas/media.schema';
import { DEFAULT_CONTAINER_CLASS, DEFAULT_PROCESSED_ATTRIBUTE } from '@/content/browse/browse-content-app';
import type { BrowseAdapter, HostMediaTarget } from '@/content/browse/types';

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const CARD_CONTAINER_SELECTORS = [
  '.media-grid',
  '.media-list',
  '.media-card-grid',
  '.media-card-wrap',
  '.page-content',
];

const findCardContainer = (): HTMLElement | null => {
  for (const selector of CARD_CONTAINER_SELECTORS) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) return node;
  }

  const firstCard = document.querySelector<HTMLElement>(CARD_SELECTOR);
  if (firstCard) {
    for (const selector of CARD_CONTAINER_SELECTORS) {
      const closest = firstCard.closest<HTMLElement>(selector);
      if (closest) return closest;
    }
    if (firstCard.parentElement instanceof HTMLElement) {
      return firstCard.parentElement;
    }
  }

  return document.querySelector<HTMLElement>('.page-content');
};

const parseAniListCard = (card: Element): HostMediaTarget | null => {
  const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
  if (!cover) return null;

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/\/anime\/(\d+)/);

  const anilistId = parseAniListIdOrNull(idMatch ? Number(idMatch[1]) : Number.NaN);
  if (!anilistId) return null;

  const format = parseAniListMediaFormatLabel(
    card.querySelector<HTMLSpanElement>('.hover-data .info span')?.textContent,
  );

  return { anilistId, format, mountTarget: cover };
};

const ensureOverlayContainer = (cover: HTMLAnchorElement): HTMLElement => {
  const existing = cover.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`);
  if (existing) return existing;
  const el = cover.ownerDocument.createElement('div');
  el.className = DEFAULT_CONTAINER_CLASS;
  cover.append(el);
  return el;
};

const locateExistingContainer = (card: Element): HTMLElement | null => {
  const cover = card.querySelector<HTMLElement>(COVER_SELECTOR);
  return (
    cover?.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`) ??
    card.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`)
  );
};

const clearProcessedAttribute = (card: Element): void => {
  card.querySelector<HTMLAnchorElement>(COVER_SELECTOR)?.removeAttribute(DEFAULT_PROCESSED_ATTRIBUTE);
};

export const anilistBrowseAdapter: BrowseAdapter = {
  cardSelector: CARD_SELECTOR,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  parseCard: parseAniListCard,
  ensureContainer: ensureOverlayContainer,
  getContainerForCard: locateExistingContainer,
  onCardInvalid: clearProcessedAttribute,
  getObserverRoot: () => document.body ?? document.documentElement,
  getScanRoot: () => findCardContainer(),
  mutationObserverInit: {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  },
  resizeObserverTargets: () => (document.body ? [document.body] : []),
  anchorCorner: 'bottom-left',
  stackDirection: 'up',
  anchorOffsetX: -8,
};
