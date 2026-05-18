/** AniList browse surface composition for content-owned overlays. */
// src/content/anilist/browse/index.tsx

import '@/shared/styles/base.css';
import cardOverlayLightDomStyles from '@/features/media-overlay/card-overlay.light-dom.css?inline';
import browseLightDomStyles from './style.css?inline';
import { BrowseRoot } from '@/content/browse/browse-root';
import {
  createBrowseContentApp,
  DEFAULT_CONTAINER_CLASS,
  DEFAULT_PROCESSED_ATTRIBUTE,
} from '@/content/browse/browse-content-app';
import { createBrowseEntrypointShell } from '@/content/browse/create-browse-surface';
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

const BrowseContentApp = createBrowseContentApp(anilistBrowseAdapter);
const lightDomStylesText = `${cardOverlayLightDomStyles}\n${browseLightDomStyles}`;

export const main = createBrowseEntrypointShell({
  uiName: 'a2a-browse-root',
  lightDomStyleAttribute: 'data-a2a-browse-light-dom',
  lightDomStylesText,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  isEligible: isBrowseShellEligible,
  renderRoot: portalContainer => (
    <BrowseRoot
      BrowseContentApp={BrowseContentApp}
      portalContainer={portalContainer}
      includeModalKey
    />
  ),
});
