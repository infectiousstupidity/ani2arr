export const DEFAULT_CONTAINER_CLASS_NAME = 'w-full rounded-xl bg-bg-secondary p-5';

const normalizePathSegment = (segment: string): string => {
  const replaced = segment.replace(/[\\/]+/g, ' ');
  const trimmed = replaced.trim();
  return trimmed.replace(/\s+/g, ' ');
};

export const buildFolderSlug = (
  folderSlug?: string | null,
  title?: string,
  tvdbId?: number | null,
): string | null => {
  if (folderSlug && folderSlug.trim().length > 0) {
    return folderSlug.trim();
  }

  if (!title) return null;

  const normalizedTitle = normalizePathSegment(title);
  if (!normalizedTitle) return null;
  if (tvdbId == null) return normalizedTitle;

  return `${normalizedTitle} [tvdb-${tvdbId}]`;
};

export const formatRootPathWithSlug = (rootPath: string, slug: string | null): string => {
  if (!slug) return rootPath;

  const normalizedRoot =
    rootPath.endsWith('/') || rootPath.endsWith('\\') ? rootPath.slice(0, -1) : rootPath;

  return `${normalizedRoot}/${slug}`;
};

export const formatFreeSpace = (bytes?: number | null): string | null => {
  if (bytes == null || Number.isNaN(bytes)) return null;
  const tebibyte = 1024 ** 4;
  const gibibyte = 1024 ** 3;
  if (bytes >= tebibyte) {
    return `${(bytes / tebibyte).toFixed(1)} TiB free`;
  }
  if (bytes >= gibibyte) {
    return `${(bytes / gibibyte).toFixed(1)} GiB free`;
  }
  return `${bytes.toLocaleString()} B free`;
};

