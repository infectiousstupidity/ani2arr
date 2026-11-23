export function normalizeSeasonNumbers(
	seasons: readonly number[],
): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}
