// src/rpc/index.ts
import { defineProxyService } from '@webext-core/proxy-service';
import type {
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
  SonarrTag,
  SonarrFormState,
  SonarrCredentialsPayload,
} from '@/types';
import type { AniMedia } from '@/types';
import type { ResolveInput, MappingOutput, StatusInput, StatusOutput, AddInput, SetMappingOverrideInput, ClearMappingOverrideInput, SonarrLookupInput, SonarrLookupOutput, ValidateTvdbInput, ValidateTvdbOutput } from './schemas';

export interface KitsunarrApi {
  resolveMapping(input: ResolveInput): Promise<MappingOutput>;
  getSeriesStatus(input: StatusInput): Promise<StatusOutput>;
  addToSonarr(input: AddInput): Promise<SonarrSeries>;
  prefetchAniListMedia(ids: number[]): Promise<Array<[number, AniMedia]>>;
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
}

export const [registerKitsunarrApi, getKitsunarrApi] =
  defineProxyService<KitsunarrApi, [KitsunarrApi]>('KitsunarrApi', (impl) => impl);
