// src/shared/utils/build-external-media-link.ts
import type { MediaService } from '@/shared/types';

export interface ExternalLinkInput {
  service: MediaService;
  baseUrl: string;        // absolute; trailing slash trimmed
  inLibrary: boolean;
  librarySlug?: string;
  searchTerm?: string;
}

export function buildExternalMediaLink(input: ExternalLinkInput): string {
  const { service, baseUrl, inLibrary, librarySlug, searchTerm } = input;
  const root = baseUrl.replace(/\/$/, '');

  if (service === 'sonarr') {
    if (inLibrary && librarySlug) return `${root}/series/${librarySlug}`;
    return `${root}/add/new?term=${encodeURIComponent(searchTerm ?? '')}`;
  }
  // radarr (ready)
  if (inLibrary && librarySlug) return `${root}/movie/${librarySlug}`;
  return `${root}/add/movies/lookup?term=${encodeURIComponent(searchTerm ?? '')}`;
}
