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
