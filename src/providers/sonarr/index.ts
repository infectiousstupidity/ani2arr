/** Public exports for the Sonarr provider-domain implementation. */
// src/providers/sonarr/index.ts

export { addSonarrSeries, buildAddSonarrSeriesPayload } from "./add";
export type { AddSonarrSeriesPayload } from "./add";
export { SonarrClient } from "./client";
export { buildUpdateSonarrSeriesPayload, updateSonarrSeries } from "./edit";
export type { SonarrSeriesChanges } from "./edit";
export { SonarrLibrary, toSonarrSeriesSnapshot } from "./library";
export * from "./schemas";
export {
	normalizeSonarrTagLabel,
	resolveSonarrTagIds,
} from "./tags";
export type * from "./types";
