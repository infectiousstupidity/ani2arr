/** AniChart browse surface adapter for card parsing and portal placement. */
// src/content/anichart/browse/adapter.ts

import { parseAniListIdOrNull } from '@/anilist/anilist-id';
import { parseAniListMediaFormatLabel } from '@/anilist/schemas/media.schema';
import { DEFAULT_CONTAINER_CLASS, DEFAULT_PROCESSED_ATTRIBUTE } from '@/content/browse/browse-content-app';
import type { BrowseAdapter, HostMediaTarget } from '@/content/browse/types';

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const TITLE_SELECTOR = 'a.title';

const getSectionHeading = (card: Element): string =>
  card.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '';

const shouldSkipCard = (card: Element): boolean => {
  const heading = getSectionHeading(card).toLowerCase();
  return heading.includes('music');
};

const parseAniChartCard = (card: Element): HostMediaTarget | null => {
  const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
  if (!cover) return null;

  const title = card
    .querySelector<HTMLAnchorElement>(TITLE_SELECTOR)
    ?.textContent?.replaceAll(/\s+/g, ' ')
    .trim();
  if (!title) return null;

  if (shouldSkipCard(card)) {
    return null;
  }

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/anilist\.co\/anime\/(\d+)/i);
  const anilistId = parseAniListIdOrNull(idMatch ? Number(idMatch[1]) : Number.NaN);
  if (!anilistId) return null;

  const heading = getSectionHeading(card);

  return {
    anilistId,
    title,
    format: parseAniListMediaFormatLabel(heading),
    mountTarget: cover,
  };
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

export const anichartBrowseAdapter: BrowseAdapter = {
  cardSelector: CARD_SELECTOR,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  parseCard: parseAniChartCard,
  ensureContainer: ensureOverlayContainer,
  getContainerForCard: locateExistingContainer,
  onCardInvalid: clearProcessedAttribute,
  getObserverRoot: () => document.body ?? document.documentElement,
  getScanRoot: () => document.body ?? null,
  mutationObserverInit: {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  },
  resizeObserverTargets: () => (document.body ? [document.body] : []),
  anchorCorner: 'top-left',
  stackDirection: 'down',
  anchorOffsetX: -8,
};
