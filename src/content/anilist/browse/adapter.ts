/** AniList browse surface adapter for card parsing and portal placement. */
// src/content/anilist/browse/adapter.ts

import {
  parseAniListIdOrNull,
  parseAniListMediaFormatLabel,
} from '@/anilist/types';
import type { BrowseAdapter, HostMediaTarget } from '@/content/browse/types';

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const TITLE_SELECTOR = 'a.title';
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

  const title = card
    .querySelector<HTMLAnchorElement>(TITLE_SELECTOR)
    ?.textContent?.replaceAll(/\s+/g, ' ')
    .trim();
  if (!title) return null;

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/\/anime\/(\d+)/);

  const anilistId = parseAniListIdOrNull(idMatch ? Number(idMatch[1]) : Number.NaN);
  if (!anilistId) return null;

  const format = parseAniListMediaFormatLabel(
    card.querySelector<HTMLSpanElement>('.hover-data .info span')?.textContent,
  );

  return { anilistId, title, format, mountTarget: cover };
};

export const anilistBrowseAdapter: BrowseAdapter = {
  cardSelector: CARD_SELECTOR,
  parseCard: parseAniListCard,
  getObserverRoot: () => document.body ?? document.documentElement,
  getScanRoot: () => findCardContainer(),
  anchorCorner: 'bottom-left',
  stackDirection: 'up',
};
