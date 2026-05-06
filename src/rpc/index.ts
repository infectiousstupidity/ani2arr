/** Typed RPC contract exposed across extension contexts. */
// src/rpc/index.ts
import { defineProxyService } from "@webext-core/proxy-service";
import type { AniListId } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import type {
	RadarrFormState,
	SonarrFormState,
} from "@/providers/settings/provider-settings.schema";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import type {
	Provider,
	ProviderFormOptions,
	RadarrMovie,
} from "@/providers";
import type { SonarrSeriesLibraryStatus } from "@/providers/sonarr/library";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type {
	GetAniListMetadataOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
	RadarrLookupOutput,
	SonarrLookupOutput,
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
	RadarrLibraryStatus,
} from "./types";
import type {
	StatusInput,
	SeriesLibraryStatusInput,
	MovieLibraryStatusInput,
	AddSonarrInput,
	AddRadarrInput,
	GetProviderFormOptionsInput,
	UpdateSonarrInput,
	UpdateRadarrInput,
	SetManualMappingInput,
	ClearManualMappingInput,
	SonarrLookupInput,
	RadarrLookupInput,
	ValidateTvdbInput,
	ValidateTmdbInput,
	SetMappingIgnoreInput,
	ClearMappingIgnoreInput,
	SetMappingRejectedCandidateInput,
	ClearMappingRejectedCandidateInput,
	GetMappingsInput,
	GetMappingInspectionInput,
	GetAniListMetadataInput,
	TestProviderConnectionInput,
} from "./schemas";

export interface Ani2arrApi {
	getSeriesStatus(input: StatusInput): Promise<CheckSeriesStatusResponse>;
	getMovieStatus(input: StatusInput): Promise<CheckMovieStatusResponse>;
	getSeriesLibraryStatus(
		input: SeriesLibraryStatusInput,
	): Promise<SonarrSeriesLibraryStatus>;
	getMovieLibraryStatus(
		input: MovieLibraryStatusInput,
	): Promise<RadarrLibraryStatus>;
	addToSonarr(input: AddSonarrInput): Promise<SonarrSeries>;
	addToRadarr(input: AddRadarrInput): Promise<RadarrMovie>;
	updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
	updateRadarrMovie(input: UpdateRadarrInput): Promise<RadarrMovie>;
	prefetchAniListMedia(
		ids: AniListId[],
	): Promise<Array<[AniListId, AniListMedia]>>;
	fetchAniListMedia(anilistId: AniListId): Promise<AniListMedia | null>;
	getMappingIdentities(ids: AniListId[]): Promise<EffectiveMappingPresence[]>;
	/** @deprecated Use getMappingIdentities for provider-aware known mapping lookup. */
	getStaticMapped(ids: AniListId[]): Promise<AniListId[]>;
	notifyProviderConnectionChanged(input?: {
		changedProviders?: Provider[];
		disconnectedProviders?: Provider[];
	}): Promise<{ ok: true }>;
	updateSonarrDefaults(defaults: SonarrFormState): Promise<{ ok: true }>;
	updateRadarrDefaults(defaults: RadarrFormState): Promise<{ ok: true }>;
	testProviderConnection(
		input: TestProviderConnectionInput,
	): Promise<{ version: string }>;
	getSonarrFormOptions(
		input?: GetProviderFormOptionsInput,
	): Promise<ProviderFormOptions>;
	getRadarrFormOptions(
		input?: GetProviderFormOptionsInput,
	): Promise<ProviderFormOptions>;
	initMappings(): Promise<void>;
	setManualMapping(input: SetManualMappingInput): Promise<{ ok: true }>;
	clearManualMapping(input: ClearManualMappingInput): Promise<{ ok: true }>;
	setMappingIgnore(input: SetMappingIgnoreInput): Promise<{ ok: true }>;
	clearMappingIgnore(input: ClearMappingIgnoreInput): Promise<{ ok: true }>;
	setMappingRejectedCandidate(
		input: SetMappingRejectedCandidateInput,
	): Promise<{ ok: true }>;
	clearMappingRejectedCandidate(
		input: ClearMappingRejectedCandidateInput,
	): Promise<{ ok: true }>;
	searchSonarr(input: SonarrLookupInput): Promise<SonarrLookupOutput>;
	searchRadarr(input: RadarrLookupInput): Promise<RadarrLookupOutput>;
	validateTvdbId(
		input: ValidateTvdbInput,
	): Promise<{ isInLibrary: boolean; inCatalog: boolean }>;
	validateTmdbId(
		input: ValidateTmdbInput,
	): Promise<{ isInLibrary: boolean; inCatalog: boolean }>;
	clearPersistentCaches(): Promise<{ ok: true }>;
	resetExtensionState(): Promise<{ ok: true }>;
	getMappings(input?: GetMappingsInput): Promise<GetMappingsOutput>;
	getMappingInspection(
		input: GetMappingInspectionInput,
	): Promise<GetMappingInspectionOutput>;
	getAniListMetadata(
		input: GetAniListMetadataInput,
	): Promise<GetAniListMetadataOutput>;
}

export const [registerAni2arrApi, getAni2arrApi] = defineProxyService<
	Ani2arrApi,
	[Ani2arrApi]
>("Ani2arrApi", (impl) => impl);
