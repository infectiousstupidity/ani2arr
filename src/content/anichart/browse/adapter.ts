/** AniChart browse surface adapter for card parsing and portal placement. */
// src/content/anichart/browse/adapter.ts

import {
  parseAniListIdOrNull,
  parseAniListMediaFormatLabel,
} from '@/anilist/types';
import type { BrowseAdapter, HostMediaTarget } from '@/content/browse/types';

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const TITLE_SELECTOR = 'a.title';
const SECTION_HEADING_SELECTOR = 'h2.section-heading, h2';

export const getDirectSectionHeadingText = (heading: Element | null): string => {
  if (!heading) return '';

  return [...heading.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join(' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
};

const getSectionHeading = (card: Element): string =>
  getDirectSectionHeadingText(
    card.closest('section')?.querySelector(SECTION_HEADING_SELECTOR) ?? null,
  );

const shouldSkipCard = (card: Element): boolean => {
  return parseAniListMediaFormatLabel(getSectionHeading(card)) === 'MUSIC';
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

export const anichartBrowseAdapter: BrowseAdapter = {
  cardSelector: CARD_SELECTOR,
  parseCard: parseAniChartCard,
  getObserverRoot: () => document.body ?? document.documentElement,
  getScanRoot: () => document.body ?? null,
  anchorCorner: 'top-left',
  stackDirection: 'down',
};
