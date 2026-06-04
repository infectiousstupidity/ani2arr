/** Typed RPC contract exposed across extension contexts. */
// src/rpc/index.ts
import {
	createProxyService,
	registerService,
	type ProxyServiceKey,
} from "@webext-core/proxy-service";
import type { AniListId, AniListMedia } from "@/anilist/types";
import { normalizeError } from "@/shared/errors/error-utils";
import type { ProviderFormResources } from "@/providers/types";
import type { RadarrMovie } from "@/providers/radarr/types";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type {
	GetAniListMetadataOutput,
	GetMappingInspectionOutput,
	GetMappingsOutput,
	MappingIdentity,
	RadarrLookupOutput,
	SonarrLookupOutput,
	GetMovieStatusOutput,
	GetSeriesStatusOutput,
	StatusInput,
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
	ProviderConnectionTestInput,
	GetProviderBaseUrlInput,
	NotifyProviderConnectionChangedInput,
} from "./types";

export interface Ani2arrApi {
	getSeriesStatus(input: StatusInput): Promise<GetSeriesStatusOutput>;
	getMovieStatus(input: StatusInput): Promise<GetMovieStatusOutput>;
	addToSonarr(input: AddSonarrInput): Promise<SonarrSeries>;
	addToRadarr(input: AddRadarrInput): Promise<RadarrMovie>;
	updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
	updateRadarrMovie(input: UpdateRadarrInput): Promise<RadarrMovie>;
	fetchAniListMedia(anilistId: AniListId): Promise<AniListMedia | null>;
	getMappingIdentities(ids: AniListId[]): Promise<MappingIdentity[]>;
	notifyProviderConnectionChanged(
		input?: NotifyProviderConnectionChangedInput,
	): Promise<{ ok: true }>;
	testSonarrConnection(
		input: ProviderConnectionTestInput,
	): Promise<{ version: string }>;
	testRadarrConnection(
		input: ProviderConnectionTestInput,
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
