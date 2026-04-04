/** DOM and layout helpers for the AniList anime-page surface. */
// src/content/anilist/anime-page/layout.ts

import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';

export const ACTIONS_SELECTOR = '.header .cover-wrap .actions, .cover-wrap .actions';
export const LIST_ROW_SELECTOR = '.actions .list';
export const SIDEBAR_SELECTOR = '.content.container .sidebar';

export const UI_NAME = 'a2a-anime-page-ui';
export const ANCHOR_ID = 'a2a-actions-anchor';
export const SPACER_ID = 'a2a-actions-spacer';

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function q<T extends Element>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

export function waitForElement(
  selector: string,
  {
    root = document,
    signal,
  }: {
    root?: ParentNode;
    signal?: AbortSignal;
  } = {},
): Promise<Element> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const hit = root.querySelector(selector);
    if (hit) {
      resolve(hit);
      return;
    }

    const mo = new MutationObserver(() => {
      if (signal?.aborted) {
        mo.disconnect();
        reject(createAbortError());
        return;
      }

      const el = root.querySelector(selector);
      if (el) {
        mo.disconnect();
        signal?.removeEventListener('abort', onAbort);
        resolve(el);
      }
    });

    const onAbort = () => {
      mo.disconnect();
      reject(createAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

export function removeLayoutArtifacts(): void {
  q<HTMLElement>(`#${ANCHOR_ID}`)?.remove();
  q<HTMLElement>(`#${SPACER_ID}`)?.remove();
}

export function ensureActionsAnchor(): HTMLElement | null {
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  if (!actions) return null;

  let anchor = actions.querySelector<HTMLElement>(`#${ANCHOR_ID}`);
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.id = ANCHOR_ID;
    anchor.style.display = 'block';
    anchor.style.gridColumn = '1 / -1';
    anchor.style.justifySelf = 'stretch';
    anchor.style.margin = '0';
    anchor.style.width = 'auto';
    anchor.style.maxWidth = 'none';
    const listRow = actions.querySelector(LIST_ROW_SELECTOR);
    if (listRow) listRow.before(anchor);
    else actions.prepend(anchor);
  }
  return anchor;
}

export function startAnchorKeeper(): () => void {
  const heroRoot = q<HTMLElement>('.header .cover-wrap') ?? q<HTMLElement>('.cover-wrap') ?? document.body;
  ensureActionsAnchor();
  const mo = new MutationObserver(() => ensureActionsAnchor());
  mo.observe(heroRoot, { childList: true, subtree: true });
  return () => mo.disconnect();
}

export function ensureSidebarSpacer(): HTMLElement | null {
  const sidebar = q<HTMLElement>(SIDEBAR_SELECTOR);
  if (!sidebar) return null;

  let spacer = sidebar.querySelector<HTMLElement>(`#${SPACER_ID}`);
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.id = SPACER_ID;
    spacer.style.width = '100%';
    spacer.style.height = '0px';
    spacer.style.margin = '0';
    const rankings = sidebar.querySelector('.rankings');
    if (rankings) rankings.before(spacer);
    else sidebar.prepend(spacer);
  }
  return spacer;
}

export function syncSidebarOffset(spacer: HTMLElement | null): void {
  if (!spacer) return;
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  const h = Math.ceil(actions?.getBoundingClientRect().height || 0);
  spacer.style.height = `${h + 8}px`;
}

export function attachSizeSync(host: HTMLElement): () => void {
  Object.assign(host.style, {
    display: 'block',
    position: 'static',
    zIndex: 'auto',
    width: 'auto',
    maxWidth: '100%',
    margin: '0',
  });

  const spacer = ensureSidebarSpacer();
  const sync = () => {
    // Match AniList's native Add-to-List button width exactly to avoid sub-pixel drift.
    const nativeList = q<HTMLElement>('.actions .list');
    const listBox = nativeList?.getBoundingClientRect();
    const listWidth = listBox ? Math.round(listBox.width) : 165;
    host.style.width = `${listWidth}px`;

    const fav = q<HTMLElement>('.actions .favourite');
    const favBox = fav?.getBoundingClientRect();
    const favSide = favBox ? Math.round(Math.max(favBox.width, favBox.height)) : 35;
    host.style.setProperty('--a2a-fav-size', `${favSide}px`);
    syncSidebarOffset(spacer);
  };

  sync();

  const fav = q<HTMLElement>('.actions .favourite');
  const actions = q<HTMLElement>(ACTIONS_SELECTOR);
  const roFav = fav ? new ResizeObserver(sync) : null;
  if (fav && roFav) roFav.observe(fav);
  const roHost = new ResizeObserver(sync);
  roHost.observe(host);
  const roActions = actions ? new ResizeObserver(sync) : null;
  if (actions && roActions) roActions.observe(actions);
  window.addEventListener('resize', sync);

  return () => {
    roFav?.disconnect();
    roHost.disconnect();
    roActions?.disconnect();
    window.removeEventListener('resize', sync);
    q<HTMLElement>(`#${SPACER_ID}`)?.remove();
  };
}

export function readFormatFromSidebar(doc: Document = document): AniListMediaFormat | null {
  const rows = [...doc.querySelectorAll<HTMLDivElement>('.sidebar .data .data-set')];
  const formatRow = rows.find(r => r.querySelector('.type')?.textContent?.trim() === 'Format');
  const raw = formatRow?.querySelector('.value')?.textContent ?? '';
  const normalized = raw.replaceAll(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('movie')) return 'MOVIE';
  if (normalized.includes('music')) return 'MUSIC';
  if (normalized === 'tv short') return 'TV_SHORT';
  if (normalized === 'tv') return 'TV';
  if (normalized === 'special') return 'SPECIAL';
  if (normalized === 'ova') return 'OVA';
  if (normalized === 'ona') return 'ONA';
  return null;
}

function shouldSkipByFormat(doc: Document = document): boolean {
  return resolveProviderForAniListFormat(readFormatFromSidebar(doc)) === null;
}

export async function resolveAnimePageProvider(signal: AbortSignal): Promise<'sonarr' | 'radarr' | null> {
  await waitForElement(SIDEBAR_SELECTOR, { signal });
  return resolveProviderForAniListFormat(readFormatFromSidebar(document));
}

export { shouldSkipByFormat };
