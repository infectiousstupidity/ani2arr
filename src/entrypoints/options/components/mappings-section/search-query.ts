export const normalizeMappingSearchQuery = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length >= 2 ? trimmed : undefined;
};
