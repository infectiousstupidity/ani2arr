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

