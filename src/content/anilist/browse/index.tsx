/** AniList browse surface composition for content-owned overlays. */
// src/content/anilist/browse/index.tsx

import '@/shared/styles/content-base.css';
import browseLightDomStyles from './style.css?inline';
import cardOverlayStyles from '@/features/media-overlay/card-overlay.light-dom.css?inline';
import { createBrowseEntrypointShell } from '@/content/browse/create-browse-entrypoint';
import { anilistBrowseAdapter } from './adapter';
import type { PublicOptions } from '@/settings';

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

const isBrowseShellEligible = ({
  url,
  publicOptions,
}: {
  url: string;
  publicOptions: PublicOptions;
}): boolean => {
  if (!isBrowseSurface(url)) {
    return false;
  }

  return (
    (publicOptions.ui?.browseCards?.sonarr?.enabled ?? true) ||
    (publicOptions.ui?.browseCards?.radarr?.enabled ?? true)
  );
};

const lightDomStylesText = `${browseLightDomStyles}\n${cardOverlayStyles}`;

export const main = createBrowseEntrypointShell({
  adapter: anilistBrowseAdapter,
  uiName: 'a2a-browse-root',
  lightDomStylesText,
  isEligible: isBrowseShellEligible,
});
