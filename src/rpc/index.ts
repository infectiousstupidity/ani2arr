/** Typed RPC contract exposed across extension contexts. */
// src/rpc/index.ts
import {
	createProxyService,
	registerService,
	type ProxyServiceKey,
} from "@webext-core/proxy-service";
import type { AniListId } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import { normalizeError } from "@/shared/errors";
import type { Provider, ProviderFormResources, RadarrMovie } from "@/providers";
import type { SonarrSeriesLibraryStatus } from "@/providers/sonarr/library";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type { RadarrMovieLibraryStatus } from "@/providers/radarr/library";
import type {
	GetAniListMetadataOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
	RadarrLookupOutput,
	SonarrLookupOutput,
	CheckMovieStatusResponse,
	CheckSeriesStatusResponse,
} from "./types";
import type {
	StatusInput,
	SeriesLibraryStatusInput,
	MovieLibraryStatusInput,
	AddSonarrInput,
	AddRadarrInput,
	GetProviderFormResourcesInput,
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
	GetProviderBaseUrlInput,
} from "./schemas";

export interface Ani2arrApi {
	getSeriesStatus(input: StatusInput): Promise<CheckSeriesStatusResponse>;
	getMovieStatus(input: StatusInput): Promise<CheckMovieStatusResponse>;
	getSeriesLibraryStatus(
		input: SeriesLibraryStatusInput,
	): Promise<SonarrSeriesLibraryStatus>;
	getMovieLibraryStatus(
		input: MovieLibraryStatusInput,
	): Promise<RadarrMovieLibraryStatus>;
	addToSonarr(input: AddSonarrInput): Promise<SonarrSeries>;
	addToRadarr(input: AddRadarrInput): Promise<RadarrMovie>;
	updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
	updateRadarrMovie(input: UpdateRadarrInput): Promise<RadarrMovie>;
	prefetchAniListMedia(
		ids: AniListId[],
	): Promise<Array<[AniListId, AniListMedia]>>;
	fetchAniListMedia(anilistId: AniListId): Promise<AniListMedia | null>;
	getMappingIdentities(ids: AniListId[]): Promise<EffectiveMappingPresence[]>;
	notifyProviderConnectionChanged(input?: {
		changedProviders?: Provider[];
		disconnectedProviders?: Provider[];
	}): Promise<{ ok: true }>;
	testProviderConnection(
		input: TestProviderConnectionInput,
	): Promise<{ version: string }>;
	getProviderBaseUrl(input: GetProviderBaseUrlInput): Promise<string>;
	getSonarrFormResources(
		input?: GetProviderFormResourcesInput,
	): Promise<ProviderFormResources>;
	getRadarrFormResources(
		input?: GetProviderFormResourcesInput,
	): Promise<ProviderFormResources>;
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

const ANI2ARR_API_KEY = "Ani2arrApi" as ProxyServiceKey<Ani2arrApi>;

type Ani2arrApiProxyMethod = (...args: unknown[]) => Promise<unknown>;

export function registerAni2arrApi(api: Ani2arrApi) {
	return registerService(ANI2ARR_API_KEY, api);
}

function normalizeAni2arrApiErrors(api: Ani2arrApi): Ani2arrApi {
	return new Proxy(api, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver) as unknown;
			if (typeof value !== "function") {
				return value;
			}

			return async (...args: unknown[]) => {
				try {
					return await (value as Ani2arrApiProxyMethod)(...args);
				} catch (error) {
					throw normalizeError(error);
				}
			};
		},
	}) as Ani2arrApi;
}

export function getAni2arrApi() {
	return normalizeAni2arrApiErrors(createProxyService(ANI2ARR_API_KEY));
}
