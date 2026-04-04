/** AniChart browse surface composition for content-owned overlays. */
// src/content/anichart/browse/index.tsx

import baseStyles from '@/shared/styles/base.css?inline';
import browseStyles from './style.css?inline';
import { BrowseRoot } from '@/content/browse/browse-root';
import {
  createBrowseContentApp,
  DEFAULT_CONTAINER_CLASS,
  DEFAULT_PROCESSED_ATTRIBUTE,
} from '@/content/browse/browse-content-app';
import { createBrowseEntrypointShell } from '@/content/browse/create-browse-surface';
import { anichartBrowseAdapter } from './adapter';
import type { PublicOptions } from '@/options';

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
const stylesText = `${baseStyles}\n${browseStyles}`;

export const main = createBrowseEntrypointShell({
  uiName: 'a2a-anichart-root',
  styleAttribute: 'data-a2a-anichart',
  shadowStyleAttribute: 'data-a2a-anichart-shadow',
  stylesText,
  containerClassName: DEFAULT_CONTAINER_CLASS,
  processedAttribute: DEFAULT_PROCESSED_ATTRIBUTE,
  isEligible: isBrowseShellEligible,
  renderRoot: portalContainer => (
    <BrowseRoot BrowseContentApp={BrowseContentApp} portalContainer={portalContainer} />
  ),
});
