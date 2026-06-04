/** AniChart browse surface composition for content-owned overlays. */
// src/content/anichart/browse/index.tsx

import '@/shared/styles/content-base.css';
import browseLightDomStyles from './style.css?inline';
import cardOverlayStyles from '@/features/media-overlay/card-overlay.light-dom.css?inline';
import { createBrowseEntrypointShell } from '@/content/browse/create-browse-entrypoint';
import { anichartBrowseAdapter } from './adapter';
import type { PublicOptions } from "@/settings/types";

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

const lightDomStylesText = `${browseLightDomStyles}\n${cardOverlayStyles}`;

export const main = createBrowseEntrypointShell({
  adapter: anichartBrowseAdapter,
  uiName: 'a2a-anichart-root',
  lightDomStylesText,
  isEligible: isBrowseShellEligible,
});
