/** AniChart browse surface composition for content-owned overlays. */
// src/content/anichart/browse/index.tsx

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
import { anichartBrowseAdapter } from './adapter';
import type { PublicOptions } from '@/settings';

const isAniChartSurface = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'anichart.net' && u.hostname !== 'www.anichart.net') return false;
    return true;
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
  if (!isAniChartSurface(url)) {
    return false;
  }

  return (
    (publicOptions.ui?.browseCards?.sonarr?.enabled ?? true) ||
    (publicOptions.ui?.browseCards?.radarr?.enabled ?? true)
  );
};

const BrowseContentApp = createBrowseContentApp(anichartBrowseAdapter);
const lightDomStylesText = `${cardOverlayLightDomStyles}\n${browseLightDomStyles}`;

export const main = createBrowseEntrypointShell({
  uiName: 'a2a-anichart-root',
  lightDomStyleAttribute: 'data-a2a-anichart-light-dom',
  lightDomStylesText,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  isEligible: isBrowseShellEligible,
  renderRoot: portalContainer => (
    <BrowseRoot BrowseContentApp={BrowseContentApp} portalContainer={portalContainer} />
  ),
});
