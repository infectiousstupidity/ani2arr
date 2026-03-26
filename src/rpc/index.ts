/** Typed RPC contract exposed across extension contexts. */
// src/rpc/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import type {
  AniListMedia,
  ProviderCredentials,
  RadarrMovie,
  SonarrSeries,
  SonarrFormState,
  RadarrFormState,
} from '@/shared/types';
import type {
  AniListSearchResult,
  ExportStoredMappingsOutput,
  GetAniListMetadataOutput,
  GetAniListSchedulerDebugOutput,
  GetMappingsOutput,
  GetRadarrMetadataOutput,
  MappingOutput,
  MappingOverrideItem,
  MovieStatusOutput,
  RadarrLookupOutput,
  SonarrLookupOutput,
  SonarrMetadataOutput,
  StatusOutput,
  ValidateTmdbOutput,
  ValidateTvdbOutput,
} from './types';
import type {
  ResolveInput,
  StatusInput,
  AddInput,
  AddRadarrInput,
  UpdateSonarrInput,
  UpdateRadarrInput,
  SetMappingOverrideInput,
  ClearMappingOverrideInput,
  SonarrLookupInput,
  RadarrLookupInput,
  ValidateTvdbInput,
  ValidateTmdbInput,
  SetMappingIgnoreInput,
  ClearMappingIgnoreInput,
  SetMappingRejectedCandidateInput,
  ClearMappingRejectedCandidateInput,
  SetMappingBlockedCandidateInput,
  ClearMappingBlockedCandidateInput,
  GetMappingsInput,
  GetAniListMetadataInput,
  SearchAniListInput,
  TestProviderConnectionInput,
} from './schemas';

export interface Ani2arrApi {
  resolveMapping(input: ResolveInput): Promise<MappingOutput>;
  getSeriesStatus(input: StatusInput): Promise<StatusOutput>;
  getMovieStatus(input: StatusInput): Promise<MovieStatusOutput>;
  addToSonarr(input: AddInput): Promise<SonarrSeries>;
  addToRadarr(input: AddRadarrInput): Promise<RadarrMovie>;
  updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
  updateRadarrMovie(input: UpdateRadarrInput): Promise<RadarrMovie>;
  prefetchAniListMedia(ids: number[]): Promise<Array<[number, AniListMedia]>>;
  fetchAniListMedia(anilistId: number): Promise<AniListMedia | null>;
  getStaticMapped(ids: number[]): Promise<number[]>;
  notifySettingsChanged(): Promise<{ ok: true }>;
  updateSonarrDefaults(defaults: SonarrFormState): Promise<{ ok: true }>;
  updateRadarrDefaults(defaults: RadarrFormState): Promise<{ ok: true }>;
  getQualityProfiles(): Promise<SonarrMetadataOutput['qualityProfiles']>;
  getRootFolders(): Promise<SonarrMetadataOutput['rootFolders']>;
  getTags(): Promise<SonarrMetadataOutput['tags']>;
  testProviderConnection(input: TestProviderConnectionInput): Promise<{ version: string }>;
  getSonarrMetadata(input?: { credentials?: ProviderCredentials }): Promise<SonarrMetadataOutput>;
  getRadarrMetadata(input?: { credentials?: ProviderCredentials }): Promise<GetRadarrMetadataOutput>;
  initMappings(): Promise<void>;
  setMappingOverride(input: SetMappingOverrideInput): Promise<{ ok: true }>;
  clearMappingOverride(input: ClearMappingOverrideInput): Promise<{ ok: true }>;
  setMappingIgnore(input: SetMappingIgnoreInput): Promise<{ ok: true }>;
  clearMappingIgnore(input: ClearMappingIgnoreInput): Promise<{ ok: true }>;
  setMappingRejectedCandidate(input: SetMappingRejectedCandidateInput): Promise<{ ok: true }>;
  clearMappingRejectedCandidate(input: ClearMappingRejectedCandidateInput): Promise<{ ok: true }>;
  setMappingBlockedCandidate(input: SetMappingBlockedCandidateInput): Promise<{ ok: true }>;
  clearMappingBlockedCandidate(input: ClearMappingBlockedCandidateInput): Promise<{ ok: true }>;
  searchSonarr(input: SonarrLookupInput): Promise<SonarrLookupOutput>;
  searchRadarr(input: RadarrLookupInput): Promise<RadarrLookupOutput>;
  validateTvdbId(input: ValidateTvdbInput): Promise<ValidateTvdbOutput>;
  validateTmdbId(input: ValidateTmdbInput): Promise<ValidateTmdbOutput>;
  getMappingOverrides(): Promise<MappingOverrideItem[]>;
  clearAllMappingOverrides(): Promise<{ ok: true }>;
  exportStoredMappings(): Promise<ExportStoredMappingsOutput>;
  clearPersistentCaches(): Promise<{ ok: true }>;
  resetExtensionState(): Promise<{ ok: true }>;
  getMappings(input?: GetMappingsInput): Promise<GetMappingsOutput>;
  getAniListMetadata(input: GetAniListMetadataInput): Promise<GetAniListMetadataOutput>;
  getAniListSchedulerDebug(): Promise<GetAniListSchedulerDebugOutput>;
  searchAniList(input: SearchAniListInput): Promise<AniListSearchResult[]>;
}

export const [registerAni2arrApi, getAni2arrApi] =
  defineProxyService<Ani2arrApi, [Ani2arrApi]>('Ani2arrApi', (impl) => impl);
