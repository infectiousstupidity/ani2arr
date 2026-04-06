/** Typed RPC contract exposed across extension contexts. */
// src/rpc/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import type { AniListMedia } from '@/anilist/schemas/media.schema';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type { MappingProviderIdRecord } from '@/mapping/types';
import type { ProviderMetadata, RadarrMovie, SonarrSeries } from '@/providers';
import type {
  ExportStoredMappingsOutput,
  GetAniListMetadataOutput,
  GetMappingInspectionOutput,
  GetMappingsOutput,
  RadarrLookupOutput,
  SonarrLookupOutput,
  CheckMovieStatusResponse,
  CheckSeriesStatusResponse,
} from './types';
import type {
  StatusInput,
  AddSonarrInput,
  AddRadarrInput,
  GetProviderMetadataInput,
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
  GetMappingsInput,
  GetMappingInspectionInput,
  GetAniListMetadataInput,
  TestProviderConnectionInput,
} from './schemas';

export interface Ani2arrApi {
  getSeriesStatus(input: StatusInput): Promise<CheckSeriesStatusResponse>;
  getMovieStatus(input: StatusInput): Promise<CheckMovieStatusResponse>;
  addToSonarr(input: AddSonarrInput): Promise<SonarrSeries>;
  addToRadarr(input: AddRadarrInput): Promise<RadarrMovie>;
  updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
  updateRadarrMovie(input: UpdateRadarrInput): Promise<RadarrMovie>;
  prefetchAniListMedia(ids: number[]): Promise<Array<[number, AniListMedia]>>;
  fetchAniListMedia(anilistId: number): Promise<AniListMedia | null>;
  getStaticMapped(ids: number[]): Promise<number[]>;
  notifySettingsChanged(): Promise<{ ok: true }>;
  updateSonarrDefaults(defaults: SonarrFormState): Promise<{ ok: true }>;
  updateRadarrDefaults(defaults: RadarrFormState): Promise<{ ok: true }>;
  testProviderConnection(input: TestProviderConnectionInput): Promise<{ version: string }>;
  getSonarrMetadata(input?: GetProviderMetadataInput): Promise<ProviderMetadata>;
  getRadarrMetadata(input?: GetProviderMetadataInput): Promise<ProviderMetadata>;
  initMappings(): Promise<void>;
  setMappingOverride(input: SetMappingOverrideInput): Promise<{ ok: true }>;
  clearMappingOverride(input: ClearMappingOverrideInput): Promise<{ ok: true }>;
  setMappingIgnore(input: SetMappingIgnoreInput): Promise<{ ok: true }>;
  clearMappingIgnore(input: ClearMappingIgnoreInput): Promise<{ ok: true }>;
  setMappingRejectedCandidate(input: SetMappingRejectedCandidateInput): Promise<{ ok: true }>;
  clearMappingRejectedCandidate(input: ClearMappingRejectedCandidateInput): Promise<{ ok: true }>;
  searchSonarr(input: SonarrLookupInput): Promise<SonarrLookupOutput>;
  searchRadarr(input: RadarrLookupInput): Promise<RadarrLookupOutput>;
  validateTvdbId(input: ValidateTvdbInput): Promise<{ inLibrary: boolean; inCatalog: boolean }>;
  validateTmdbId(input: ValidateTmdbInput): Promise<{ inLibrary: boolean; inCatalog: boolean }>;
  getMappingOverrides(): Promise<MappingProviderIdRecord[]>;
  clearAllMappingOverrides(): Promise<{ ok: true }>;
  exportStoredMappings(): Promise<ExportStoredMappingsOutput>;
  clearPersistentCaches(): Promise<{ ok: true }>;
  resetExtensionState(): Promise<{ ok: true }>;
  getMappings(input?: GetMappingsInput): Promise<GetMappingsOutput>;
  getMappingInspection(input: GetMappingInspectionInput): Promise<GetMappingInspectionOutput>;
  getAniListMetadata(input: GetAniListMetadataInput): Promise<GetAniListMetadataOutput>;
}

export const [registerAni2arrApi, getAni2arrApi] =
  defineProxyService<Ani2arrApi, [Ani2arrApi]>('Ani2arrApi', (impl) => impl);
