// src/entrypoints/anichart-browse.content/index.tsx
import { extractMediaMetadataFromDom } from '@/shared/anilist/dom/anilist-dom';
import { mergeMetadataHints } from '@/shared/anilist/media-metadata';
import type { AniFormat, MediaMetadataHint } from '@/shared/types';
import baseStyles from '@/shared/styles/base.css?inline';
import browseStyles from './style.css?inline';
import {
  createBrowseContentApp,
  DEFAULT_CONTAINER_CLASS,
  DEFAULT_PROCESSED_ATTRIBUTE,
  type BrowseAdapter,
  type ParsedCard,
} from '@/features/media-overlay';
import { createBrowseContentMain } from '@/shared/entrypoints/browse-bootstrap';
import { BrowseRoot } from '@/shared/entrypoints/browse-root';

const isAniChartSurface = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'anichart.net' && u.hostname !== 'www.anichart.net') return false;
    return true;
  } catch {
    return false;
  }
};

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
// We render portals into containers attached to AniChart cover anchors (page DOM).
// Therefore we must inject styles into BOTH the shadow root and the page document.

const getSectionHeading = (card: Element): string =>
  card.closest('section')?.querySelector('h2')?.textContent?.trim() ?? '';

const shouldSkipCard = (card: Element): boolean => {
  const heading = getSectionHeading(card).toLowerCase();
  return heading.includes('movie') || heading.includes('music');
};

const parseYearFromHeading = (heading: string): number | null => {
  const match = heading.match(/(19|20|21)\d{2}/);
  return match ? Number.parseInt(match[0], 10) : null;
};

const inferFormatFromHeading = (heading: string): AniFormat | null => {
  const normalized = heading.toLowerCase();
  if (normalized.includes('short')) return 'TV_SHORT';
  if (normalized.includes('ova')) return 'OVA';
  if (normalized.includes('ona')) return 'ONA';
  if (normalized.includes('special')) return 'SPECIAL';
  if (normalized.includes('movie')) return 'MOVIE';
  if (normalized.includes('tv')) return 'TV';
  return null;
};

const metadataCache = new Map<number, MediaMetadataHint | null>();

const getCachedDomMetadata = (anilistId: number): MediaMetadataHint | null => {
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
  const anilistId = idMatch ? Number(idMatch[1]) : NaN;
  if (!Number.isFinite(anilistId)) return null;

  const title = extractTitle(card, cover);
  if (!title) return null;

  const heading = getSectionHeading(card);
  const domMetadata = getCachedDomMetadata(anilistId);
  const fallbackMetadata: MediaMetadataHint = {
    titles: { romaji: title },
    synonyms: [title],
    startYear: parseYearFromHeading(heading),
    format: inferFormatFromHeading(heading),
    relationPrequelIds: null,
  };
  const metadata = mergeMetadataHints(domMetadata, fallbackMetadata);

  return { anilistId, title, host: cover, metadata: metadata ?? null };
};

const ensureOverlayContainer = (cover: HTMLAnchorElement): HTMLElement => {
  const existing = cover.querySelector<HTMLElement>(`.${DEFAULT_CONTAINER_CLASS}`);
  if (existing) return existing;
  const el = cover.ownerDocument.createElement('div');
  el.className = DEFAULT_CONTAINER_CLASS;
  cover.appendChild(el);
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

const browseAdapter: BrowseAdapter = {
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

const BrowseContentApp = createBrowseContentApp(browseAdapter);

const stylesText = `${baseStyles}\n${browseStyles}`;

const main = createBrowseContentMain({
  logName: 'AniChart Browse Content',
  uiName: 'a2a-anichart-root',
  styleAttribute: 'data-a2a-anichart',
  shadowStyleAttribute: 'data-a2a-anichart-shadow',
  stylesText,
  coverSelector: COVER_SELECTOR,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  isSurface: isAniChartSurface,
  renderRoot: (portalContainer) => (
    <BrowseRoot BrowseContentApp={BrowseContentApp} portalContainer={portalContainer} />
  ),
});

export default defineContentScript({
  matches: ['*://anichart.net/*', '*://www.anichart.net/*'],
  cssInjectionMode: 'ui',
  main,
});
