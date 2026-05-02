/** Narrow public provider surface for shared provider contracts and routing helpers. */
// src/providers/index.ts

export { PROVIDERS } from "./types";
export type {
	Provider,
	ProviderCredentials,
	ProviderMetadata,
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
	parseProviderId,
	parseProviderIdentity,
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
} from "./provider-id";
export type {
	ProviderIdFor,
	ProviderIdentity,
	ProviderQualityProfileId,
	ProviderId,
	ProviderTagId,
	RadarrIdentity,
	RadarrMovieId,
	SonarrIdentity,
	SonarrSeriesId,
	TmdbId,
	TvdbId,
} from "./provider-id";
export type {
	RadarrLookupMovie,
	RadarrMovie,
	RadarrMovieSnapshot,
} from "./radarr.types";
export type {
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
} from "./sonarr.types";
export {
	getProviderIdLabel,
	getProviderIdentityIdLabel,
	getProviderIdentityLabel,
	getProviderLabel,
} from "./provider-labels";
export {
	getProviderBaseUrl,
	isProviderConfigured,
	resolveProviderForAniListFormat,
} from "./provider-routing";
