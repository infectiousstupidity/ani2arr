// src/entrypoints/anilist-browse.content/index.tsx
import { extractMediaMetadataFromDom } from '@/shared/utils/anilist-dom';
import { mergeMetadataHints } from '@/shared/utils/media-metadata';
import type { MediaMetadataHint } from '@/shared/types';
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

const isBrowseSurface = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'anilist.co') return false;
    const p = u.pathname;
    return p === '/' || p === '/home' || p.startsWith('/search/anime');
  } catch {
    return false;
  }
};

const CARD_SELECTOR = '.media-card';
const COVER_SELECTOR = 'a.cover';
// We render portals into containers attached to AniList cover anchors (page DOM).
// Therefore we must inject styles into BOTH the shadow root and the page document.

const CARD_CONTAINER_SELECTORS = [
  '.media-grid',
  '.media-list',
  '.media-card-grid',
  '.media-card-wrap',
  '.page-content',
];

const metadataCache = new Map<number, MediaMetadataHint | null>();

const getCachedDomMetadata = (anilistId: number): MediaMetadataHint | null => {
  if (metadataCache.has(anilistId)) {
    return metadataCache.get(anilistId) ?? null;
  }
  const metadata = extractMediaMetadataFromDom(anilistId);
  metadataCache.set(anilistId, metadata ?? null);
  return metadata ?? null;
};

// Allow movies so specials that live in Sonarr can still render overlays; keep skipping music.
const shouldSkipFormat = (format: MediaMetadataHint['format']): boolean =>
  format === 'MUSIC';

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
  const anilistId = idMatch ? Number(idMatch[1]) : NaN;

  if (!title || !Number.isFinite(anilistId)) return null;

  const domMetadata = getCachedDomMetadata(anilistId);
  if (shouldSkipFormat(domMetadata?.format ?? null)) return null;

  const fallbackMetadata: MediaMetadataHint | null = title
    ? {
        titles: title ? { romaji: title } : null,
        synonyms: title ? [title] : null,
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

const BrowseContentApp = createBrowseContentApp(browseAdapter);

const stylesText = `${baseStyles}\n${browseStyles}`;

const main = createBrowseContentMain({
  logName: 'AniList Browse Content',
  uiName: 'a2a-browse-root',
  styleAttribute: 'data-a2a-browse',
  shadowStyleAttribute: 'data-a2a-browse-shadow',
  stylesText,
  coverSelector: COVER_SELECTOR,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  isSurface: isBrowseSurface,
  renderRoot: (portalContainer) => (
    <BrowseRoot
      BrowseContentApp={BrowseContentApp}
      portalContainer={portalContainer}
      includeModalKey
    />
  ),
});

export default defineContentScript({
  matches: ['*://anilist.co/*'],
  cssInjectionMode: 'ui',
  main,
});

