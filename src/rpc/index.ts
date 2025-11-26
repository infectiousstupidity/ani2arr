// src/rpc/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import type {
  AniMedia,
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  SonarrTag,
  SonarrFormState,
  SonarrCredentialsPayload,
} from '@/shared/types';
import type { ResolveInput, MappingOutput, StatusInput, StatusOutput, AddInput, UpdateSonarrInput, SetMappingOverrideInput, ClearMappingOverrideInput, SonarrLookupInput, SonarrLookupOutput, ValidateTvdbInput, ValidateTvdbOutput, MappingOverrideItem } from './schemas';

export interface Ani2arrApi {
  resolveMapping(input: ResolveInput): Promise<MappingOutput>;
  getSeriesStatus(input: StatusInput): Promise<StatusOutput>;
  addToSonarr(input: AddInput): Promise<SonarrSeries>;
  updateSonarrSeries(input: UpdateSonarrInput): Promise<SonarrSeries>;
  prefetchAniListMedia(ids: number[]): Promise<Array<[number, AniMedia]>>;
  fetchAniListMedia(anilistId: number): Promise<AniMedia | null>;
  getStaticMapped(ids: number[]): Promise<number[]>;
  notifySettingsChanged(): Promise<{ ok: true }>;
  updateDefaults(defaults: SonarrFormState): Promise<{ ok: true }>;
  getQualityProfiles(): Promise<SonarrQualityProfile[]>;
  getRootFolders(): Promise<SonarrRootFolder[]>;
  getTags(): Promise<SonarrTag[]>;
  testConnection(payload: SonarrCredentialsPayload): Promise<{ version: string }>;
  getSonarrMetadata(input?: { credentials?: SonarrCredentialsPayload }): Promise<{
    qualityProfiles: SonarrQualityProfile[];
    rootFolders: SonarrRootFolder[];
    tags: SonarrTag[];
  }>;
  initMappings(): Promise<void>;
  setMappingOverride(input: SetMappingOverrideInput): Promise<{ ok: true }>;
  clearMappingOverride(input: ClearMappingOverrideInput): Promise<{ ok: true }>;
  searchSonarr(input: SonarrLookupInput): Promise<SonarrLookupOutput>;
  validateTvdbId(input: ValidateTvdbInput): Promise<ValidateTvdbOutput>;
  getMappingOverrides(): Promise<MappingOverrideItem[]>;
  clearAllMappingOverrides(): Promise<{ ok: true }>;
}

export const [registerAni2arrApi, getAni2arrApi] =
  defineProxyService<Ani2arrApi, [Ani2arrApi]>('Ani2arrApi', (impl) => impl);
