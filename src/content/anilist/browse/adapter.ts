/** AniList browse surface adapter for card parsing and portal placement. */
// src/content/anilist/browse/adapter.ts

import { mergeMetadataHints } from '@/anilist/metadata-hints';
import type { AniListMediaHint } from '@/anilist/schemas/media.schema';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import { extractMediaMetadataFromDom } from '@/content/anilist/dom/extract-media-metadata';
import { DEFAULT_CONTAINER_CLASS, DEFAULT_PROCESSED_ATTRIBUTE } from '@/content/browse/browse-content-app';
import type { BrowseAdapter, ParsedCard } from '@/content/browse/types';

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
const CARD_CONTAINER_SELECTORS = [
  '.media-grid',
  '.media-list',
  '.media-card-grid',
  '.media-card-wrap',
  '.page-content',
];

const metadataCache = new Map<number, AniListMediaHint | null>();

const getCachedDomMetadata = (anilistId: number): AniListMediaHint | null => {
  if (metadataCache.has(anilistId)) {
    return metadataCache.get(anilistId) ?? null;
  }
  const metadata = extractMediaMetadataFromDom(anilistId);
  metadataCache.set(anilistId, metadata ?? null);
  return metadata ?? null;
};

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

const parseAniListCard = (card: Element): ParsedCard | null => {
  const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
  if (!cover) return null;

  const title =
    (card.querySelector<HTMLDivElement>('.title a')?.textContent ?? '').trim() ||
    (card.querySelector<HTMLDivElement>('.title')?.textContent ?? '').trim() ||
    cover.getAttribute('title')?.trim() ||
    cover.querySelector('img')?.getAttribute('alt')?.trim() ||
    '';

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/\/anime\/(\d+)/);
  const anilistId = idMatch ? Number(idMatch[1]) : Number.NaN;

  if (!title || !Number.isFinite(anilistId)) return null;

  const domMetadata = getCachedDomMetadata(anilistId);
  if (resolveProviderForAniListFormat(domMetadata?.format ?? null) === null) return null;

  const fallbackMetadata: AniListMediaHint | null = title
    ? {
        titles: { romaji: title },
        synonyms: [title],
        startYear: null,
        format: domMetadata?.format ?? null,
        relationPrequelIds: null,
      }
    : null;
  const metadata = mergeMetadataHints(domMetadata, fallbackMetadata);

  return { anilistId, title, host: cover, metadata: metadata ?? null };
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
