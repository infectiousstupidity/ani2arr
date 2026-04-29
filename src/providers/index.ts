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
	ProviderTargetId,
	ProviderTagId,
	RadarrIdentity,
	RadarrMovieId,
	SonarrIdentity,
	SonarrSeriesId,
	TmdbId,
	TvdbId,
} from "./provider-id";
export {
	ProviderQualityProfileApiArraySchema,
	ProviderQualityProfileApiSchema,
	ProviderRootFolderApiArraySchema,
	ProviderRootFolderApiSchema,
	ProviderSystemStatusApiSchema,
	ProviderTagApiArraySchema,
	ProviderTagApiSchema,
} from "./schemas/provider-shared.schemas";
export type {
	ProviderQualityProfileApi,
	ProviderRootFolderApi,
	ProviderSystemStatusApi,
	ProviderTagApi,
} from "./schemas/provider-shared.schemas";
export {
	SonarrNewItemMonitorApiSchema,
	SonarrSeriesApiArraySchema,
	SonarrSeriesApiSchema,
	SonarrSeriesStatusApiSchema,
} from "./schemas/sonarr.schemas";
export type {
	SonarrNewItemMonitorApi,
	SonarrSeriesApi,
	SonarrSeriesStatusApi,
} from "./schemas/sonarr.schemas";
export {
	RadarrMovieApiArraySchema,
	RadarrMovieApiSchema,
} from "./schemas/radarr.schemas";
export type { RadarrMovieApi } from "./schemas/radarr.schemas";
export {
	toProviderMetadata,
	toProviderQualityProfiles,
	toProviderRootFolders,
	toProviderTags,
} from "./adapters/provider-metadata.adapter";
export { toRadarrLookupMovie, toRadarrMovie } from "./adapters/radarr.adapter";
export {
	toSonarrLookupSeries,
	toSonarrSeries,
} from "./adapters/sonarr.adapter";
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
