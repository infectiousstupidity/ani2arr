// src/rpc/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import type {
  AniMedia,
  RadarrCredentialsPayload,
  RadarrMovie,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  SonarrTag,
  SonarrFormState,
  RadarrFormState,
  SonarrCredentialsPayload,
} from '@/shared/types';
import type {
  ResolveInput,
  MappingOutput,
  MovieStatusOutput,
  StatusInput,
  StatusOutput,
  AddInput,
  AddRadarrInput,
  UpdateSonarrInput,
  UpdateRadarrInput,
  SetMappingOverrideInput,
  ClearMappingOverrideInput,
  SonarrLookupInput,
  SonarrLookupOutput,
  RadarrLookupInput,
  RadarrLookupOutput,
  ValidateTvdbInput,
  ValidateTvdbOutput,
  ValidateTmdbInput,
  ValidateTmdbOutput,
  MappingOverrideItem,
  SetMappingIgnoreInput,
  ClearMappingIgnoreInput,
  GetMappingsOutput,
  GetMappingsInput,
  GetAniListMetadataInput,
  GetAniListMetadataOutput,
  GetRadarrMetadataOutput,
  SearchAniListInput,
  AniListSearchResultDto,
} from './schemas';

export interface Ani2arrApi {
  resolveMapping(input: ResolveInput): Promise<MappingOutput>;
  getSeriesStatus(input: StatusInput): Promise<StatusOutput>;
  getMovieStatus(input: StatusInput): Promise<MovieStatusOutput>;
  addToSonarr(input: AddInput): Promise<SonarrSeries>;
  addToRadarr(input: AddRadarrInput): Promise<RadarrMovie>;
  updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
  updateRadarrMovie(input: UpdateRadarrInput): Promise<RadarrMovie>;
  prefetchAniListMedia(ids: number[]): Promise<Array<[number, AniMedia]>>;
  fetchAniListMedia(anilistId: number): Promise<AniMedia | null>;
  getStaticMapped(ids: number[]): Promise<number[]>;
  notifySettingsChanged(): Promise<{ ok: true }>;
  updateDefaults(defaults: SonarrFormState): Promise<{ ok: true }>;
  updateRadarrDefaults(defaults: RadarrFormState): Promise<{ ok: true }>;
  getQualityProfiles(): Promise<SonarrQualityProfile[]>;
  getRootFolders(): Promise<SonarrRootFolder[]>;
  getTags(): Promise<SonarrTag[]>;
  testConnection(payload: SonarrCredentialsPayload): Promise<{ version: string }>;
  testRadarrConnection(payload: RadarrCredentialsPayload): Promise<{ version: string }>;
  getSonarrMetadata(input?: { credentials?: SonarrCredentialsPayload }): Promise<{
    qualityProfiles: SonarrQualityProfile[];
    rootFolders: SonarrRootFolder[];
    tags: SonarrTag[];
  }>;
  getRadarrMetadata(input?: { credentials?: RadarrCredentialsPayload }): Promise<GetRadarrMetadataOutput>;
  initMappings(): Promise<void>;
  setMappingOverride(input: SetMappingOverrideInput): Promise<{ ok: true }>;
  clearMappingOverride(input: ClearMappingOverrideInput): Promise<{ ok: true }>;
  setMappingIgnore(input: SetMappingIgnoreInput): Promise<{ ok: true }>;
  clearMappingIgnore(input: ClearMappingIgnoreInput): Promise<{ ok: true }>;
  searchSonarr(input: SonarrLookupInput): Promise<SonarrLookupOutput>;
  searchRadarr(input: RadarrLookupInput): Promise<RadarrLookupOutput>;
  validateTvdbId(input: ValidateTvdbInput): Promise<ValidateTvdbOutput>;
  validateTmdbId(input: ValidateTmdbInput): Promise<ValidateTmdbOutput>;
  getMappingOverrides(): Promise<MappingOverrideItem[]>;
  clearAllMappingOverrides(): Promise<{ ok: true }>;
  getMappings(input?: GetMappingsInput): Promise<GetMappingsOutput>;
  getAniListMetadata(input: GetAniListMetadataInput): Promise<GetAniListMetadataOutput>;
  searchAniList(input: SearchAniListInput): Promise<AniListSearchResultDto[]>;
}

export const [registerAni2arrApi, getAni2arrApi] =
  defineProxyService<Ani2arrApi, [Ani2arrApi]>('Ani2arrApi', (impl) => impl);
