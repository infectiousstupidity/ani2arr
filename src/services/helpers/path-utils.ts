/** Minimal shape for building folder slugs from series-like objects. */
interface FolderSlugSource {
  path?: string | null;
  rootFolderPath?: string | null;
  folder?: string | null;
  titleSlug?: string | null;
  title?: string | null;
  tvdbId?: number | null;
}

const trimTrailingSeparators = (input: string): string => input.replace(/[\\/]+$/, '').trim();

const normalizePathForCompare = (input?: string | null): string | null => {
  if (!input) return null;
  return trimTrailingSeparators(input).replace(/\\/g, '/').toLowerCase();
};

const extractFolderSlug = (path?: string | null, rootFolderPath?: string | null): string | null => {
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

const sanitizeFolderSegment = (segment: string): string => {
  const replaced = segment.replace(/[\\/]+/g, ' ').trim();
  return replaced.replace(/\s+/g, ' ');
};

export const buildFolderSlug = (series: FolderSlugSource, fallbackTitle: string): string => {
  const fromPath = extractFolderSlug(series.path, series.rootFolderPath);
  if (fromPath) return fromPath;
  if (series.folder && series.folder.trim()) return series.folder.trim();
  if (series.titleSlug && series.titleSlug.trim()) return series.titleSlug.trim();

  const baseTitle = sanitizeFolderSegment(series.title || fallbackTitle || 'Series');
  const tvdbPart =
    typeof series.tvdbId === 'number' && Number.isFinite(series.tvdbId)
      ? ` [tvdb-${series.tvdbId}]`
      : '';
  return `${baseTitle}${tvdbPart}`;
};

export const joinRootAndSlug = (rootFolderPath: string, slug: string): string => {
  const normalizedRoot = trimTrailingSeparators(rootFolderPath);
  if (!normalizedRoot) return slug;
  const separator = normalizedRoot.includes('\\') ? '\\' : '/';
  return `${normalizedRoot}${separator}${slug}`;
};

export const paths = {
  trimTrailingSeparators,
  normalizePathForCompare,
  extractFolderSlug,
  sanitizeFolderSegment,
};
