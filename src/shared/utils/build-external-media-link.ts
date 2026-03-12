// src/shared/utils/build-external-media-link.ts
import type { MediaService } from '@/shared/types';

export interface ExternalLinkInput {
  service: MediaService;
  baseUrl: string;        // absolute; trailing slash trimmed
  inLibrary: boolean;
  librarySlug?: string;
  searchTerm?: string;
}

export function buildExternalMediaLink(input: ExternalLinkInput): string | null {
  const { service, baseUrl, inLibrary, librarySlug, searchTerm } = input;
  const root = baseUrl.replace(/\/$/, '');
  if (!root) {
    return null;
  }

  if (service === 'sonarr') {
    if (inLibrary && librarySlug) return `${root}/series/${librarySlug}`;
    return `${root}/add/new?term=${encodeURIComponent(searchTerm ?? '')}`;
  }
  // Radarr unresolved items should land on the Add New UI, not an API/guessed lookup route.
  if (inLibrary && librarySlug) return `${root}/movie/${librarySlug}`;
  return `${root}/add/new?term=${encodeURIComponent(searchTerm ?? '')}`;
}
