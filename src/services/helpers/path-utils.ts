import type { MediaService } from '@/shared/types';

/** Minimal shape for building folder slugs from series/movie-like objects. */
export interface FolderSlugSource {
  path?: string | null;
  rootFolderPath?: string | null;
  folder?: string | null;
  folderName?: string | null;
  titleSlug?: string | null;
  title?: string | null;
  tvdbId?: number | null;
  tmdbId?: number | null;
}

export const trimTrailingSeparators = (input: string): string => input.replace(/[\\/]+$/, '').trim();

export const normalizePathForCompare = (input?: string | null): string | null => {
  if (!input) return null;
  return trimTrailingSeparators(input).replace(/\\/g, '/').toLowerCase();
};

export const extractFolderSlug = (path?: string | null, rootFolderPath?: string | null): string | null => {
  if (!path) return null;
  const normalizedPath = trimTrailingSeparators(path).replace(/\\/g, '/');
  const normalizedRoot = rootFolderPath ? trimTrailingSeparators(rootFolderPath).replace(/\\/g, '/') : null;

  if (normalizedRoot && normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    const remainder = normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '');
    if (remainder.length > 0) return remainder;
  }

  const segments = normalizedPath.split('/');
  const last = segments[segments.length - 1];
  return last?.length ? last : null;
};

export const sanitizeFolderSegment = (segment: string): string => {
  const replaced = segment.replace(/[\\/]+/g, ' ').trim();
  return replaced.replace(/\s+/g, ' ');
};

export const buildFolderSlug = (media: FolderSlugSource, fallbackTitle: string): string => {
  const fromPath = extractFolderSlug(media.path, media.rootFolderPath);
  if (fromPath) return fromPath;
  if (media.folder && media.folder.trim()) return media.folder.trim();
  if (media.folderName && media.folderName.trim()) return media.folderName.trim();
  if (media.titleSlug && media.titleSlug.trim()) return media.titleSlug.trim();

  const baseTitle = sanitizeFolderSegment(media.title || fallbackTitle || 'Media');
  if (typeof media.tvdbId === 'number' && Number.isFinite(media.tvdbId)) {
    return `${baseTitle} [tvdb-${media.tvdbId}]`;
  }
  if (typeof media.tmdbId === 'number' && Number.isFinite(media.tmdbId)) {
    return `${baseTitle} [tmdb-${media.tmdbId}]`;
  }
  return baseTitle;
};

export const extractRootFolderPath = (
  media?: FolderSlugSource | null,
  slug?: string | null,
): string | null => {
  if (!media) return null;
  if (media.rootFolderPath && media.rootFolderPath.trim()) {
    return media.rootFolderPath;
  }
  if (!media.path || !media.path.trim()) {
    return null;
  }

  const normalizedPath = trimTrailingSeparators(media.path);
  if (slug && normalizedPath.toLowerCase().endsWith(slug.toLowerCase())) {
    const candidate = normalizedPath.slice(0, normalizedPath.length - slug.length);
    return trimTrailingSeparators(candidate);
  }

  const lastSlash = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  if (lastSlash === -1) return null;
  return normalizedPath.slice(0, lastSlash);
};

export const getLibrarySlug = (
  provider: MediaService,
  media?: FolderSlugSource | null,
): string | null => {
  if (!media) return null;
  if (media.titleSlug && media.titleSlug.trim()) {
    return media.titleSlug.trim();
  }
  if (provider === 'radarr' && media.folderName && media.folderName.trim()) {
    return media.folderName.trim();
  }
  if (provider === 'sonarr' && media.folder && media.folder.trim()) {
    return media.folder.trim();
  }
  return extractFolderSlug(media.path, media.rootFolderPath);
};

export const joinRootAndSlug = (rootFolderPath: string, slug: string): string => {
  const normalizedRoot = trimTrailingSeparators(rootFolderPath);
  if (!normalizedRoot) return slug;
  const separator = normalizedRoot.includes('\\') ? '\\' : '/';
  return `${normalizedRoot}${separator}${slug}`;
};

export const buildComputedMediaPath = (
  rootFolderPath: string,
  slug?: string | null,
): string | null => {
  if (!rootFolderPath || !slug) return null;
  return joinRootAndSlug(rootFolderPath, slug);
};

export const paths = {
  trimTrailingSeparators,
  normalizePathForCompare,
  extractFolderSlug,
  sanitizeFolderSegment,
};
