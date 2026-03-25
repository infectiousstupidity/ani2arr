// src/shared/utils/build-external-media-link.ts
import type { Provider } from '@/shared/types';

export interface ExternalLinkInput {
  provider: Provider;
  baseUrl: string;        // absolute; trailing slash trimmed
  inLibrary: boolean;
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
