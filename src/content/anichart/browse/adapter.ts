/** AniChart browse surface adapter for card parsing and portal placement. */
// src/content/anichart/browse/adapter.ts

import { mergeMetadataHints } from '@/anilist/metadata-hints';
import type { AniListMediaFormat, AniListMediaHint } from '@/anilist/schemas/media.schema';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import { extractMediaMetadataFromDom } from '@/content/anilist/dom/extract-media-metadata';
import { DEFAULT_CONTAINER_CLASS, DEFAULT_PROCESSED_ATTRIBUTE } from '@/content/browse/browse-content-app';
import type { BrowseAdapter, ParsedCard } from '@/content/browse/types';

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';

const getSectionHeading = (card: Element): string =>
  card.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '';

const shouldSkipCard = (card: Element): boolean => {
  const heading = getSectionHeading(card).toLowerCase();
  return heading.includes('music');
};

const parseYearFromHeading = (heading: string): number | null => {
  const match = heading.match(/(19|20|21)\d{2}/);
  return match ? Number.parseInt(match[0], 10) : null;
};

const inferFormatFromHeading = (heading: string): AniListMediaFormat | null => {
  const normalized = heading.toLowerCase();
  if (normalized.includes('short')) return 'TV_SHORT';
  if (normalized.includes('ova')) return 'OVA';
  if (normalized.includes('ona')) return 'ONA';
  if (normalized.includes('special')) return 'SPECIAL';
  if (normalized.includes('movie')) return 'MOVIE';
  if (normalized.includes('tv')) return 'TV';
  return null;
};

const metadataCache = new Map<number, AniListMediaHint | null>();

const getCachedDomMetadata = (anilistId: number): AniListMediaHint | null => {
  if (metadataCache.has(anilistId)) {
    return metadataCache.get(anilistId) ?? null;
  }
  const metadata = extractMediaMetadataFromDom(anilistId);
  metadataCache.set(anilistId, metadata ?? null);
  return metadata ?? null;
};

const extractTitle = (card: Element, cover: HTMLAnchorElement): string =>
  (card.querySelector<HTMLElement>('.overlay .title')?.textContent ?? '').trim() ||
  (cover.getAttribute('title') ?? '').trim() ||
  cover.querySelector('img')?.getAttribute('alt')?.trim() ||
  (card.querySelector<HTMLElement>('.data .header .title')?.textContent ?? '').trim() ||
  '';

const parseAniChartCard = (card: Element): ParsedCard | null => {
  const cover = card.querySelector<HTMLAnchorElement>(COVER_SELECTOR);
  if (!cover) return null;

  if (shouldSkipCard(card)) {
    return null;
  }

  const href = cover.getAttribute('href') ?? '';
  const idMatch = href.match(/anilist\.co\/anime\/(\d+)/i);
  const anilistId = idMatch ? Number(idMatch[1]) : Number.NaN;
  if (!Number.isFinite(anilistId)) return null;

  const title = extractTitle(card, cover);
  if (!title) return null;

  const heading = getSectionHeading(card);
  const domMetadata = getCachedDomMetadata(anilistId);
  const fallbackMetadata: AniListMediaHint = {
    titles: { romaji: title },
    synonyms: [title],
    startYear: parseYearFromHeading(heading),
    format: inferFormatFromHeading(heading),
    relationPrequelIds: null,
  };
  const metadata = mergeMetadataHints(domMetadata, fallbackMetadata);
  if (resolveProviderForAniListFormat(metadata?.format ?? null) === null) return null;

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
