/** Builds provider UI links for opening Sonarr and Radarr entries or prefilled add flows. */
// src/shared/utils/provider-links.ts

import type { Provider } from '@/integrations/providers/types';

interface ExternalLinkInput {
  provider: Provider;
  baseUrl: string; // Absolute provider root URL; trailing slash trimmed.
  inLibrary: boolean;
  /** Provider detail-route slug for `/series/:slug` or `/movie/:slug`, not a filesystem folder name. */
  librarySlug?: string;
  searchTerm?: string;
}

export function buildExternalMediaLink(input: ExternalLinkInput): string | null {
  const { provider, baseUrl, inLibrary, librarySlug, searchTerm } = input;
  const root = baseUrl.replace(/\/$/, '');
  if (!root) {
    return null;
  }

  if (provider === 'sonarr') {
    if (inLibrary && librarySlug) return `${root}/series/${librarySlug}`;
    return `${root}/add/new?term=${encodeURIComponent(searchTerm ?? '')}`;
  }
  // Radarr unresolved items should land on the Add New UI, not an API/guessed lookup route.
  if (inLibrary && librarySlug) return `${root}/movie/${librarySlug}`;
  return `${root}/add/new?term=${encodeURIComponent(searchTerm ?? '')}`;
}
