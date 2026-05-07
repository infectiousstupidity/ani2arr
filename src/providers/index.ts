/** Narrow public provider surface for shared provider contracts and routing helpers. */
// src/providers/index.ts

export { PROVIDERS } from "./types";
export type {
	Provider,
	ProviderCredentials,
	ProviderFormOptions,
	ProviderQualityProfile,
	ProviderRootFolder,
	ProviderTag,
} from "./types";
export {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	RadarrMovieIdSchema,
	TmdbIdSchema,
	TvdbIdSchema,
	SonarrSeriesIdSchema,
	isProviderQualityProfileId,
	isProviderTagId,
	isRadarrMovieId,
	isSonarrSeriesId,
	isTmdbId,
	isTvdbId,
	parseProviderQualityProfileId,
	parseProviderQualityProfileIdOrNull,
	parseProviderTagId,
	parseProviderTagIdOrNull,
	parseRadarrMovieId,
	parseRadarrMovieIdOrNull,
	parseSonarrSeriesId,
	parseSonarrSeriesIdOrNull,
	parseTmdbId,
	parseTmdbIdOrNull,
	parseTvdbId,
	parseTvdbIdOrNull,
} from "./schemas";
export type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
	SonarrSeriesId,
	TmdbId,
	TvdbId,
} from "./schemas";
export type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
} from "./radarr/types";
export {
	formatProviderExternalId,
	formatProviderTarget,
	getProviderExternalIdLabel,
	getProviderLabel,
} from "./provider-labels";
export { resolveProviderForAniListFormat } from "./provider-routing";
