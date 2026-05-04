import type { SonarrEditOptions, SonarrSeries } from "./types";

export type SonarrSeriesChanges = Partial<SonarrEditOptions>;

export function buildUpdateSonarrSeriesPayload(
	series: SonarrSeries,
	changes: SonarrSeriesChanges,
): SonarrSeries {
	return {
		...series,
		...changes,
	};
}
