/** Shared media-modal panel and mapping prop types. */
// src/features/media-modal/types.ts

import type {
  RadarrFormState,
} from '@/providers/settings/radarr-settings.schema';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import type {
  ProviderQualityProfile,
  ProviderRootFolder,
  ProviderTag,
} from '@/providers';
import type { MappingAniListSummary, MappingSearchResult, UseMappingControllerResult } from '@/features/mapping';
import type { UseRadarrPanelControllerResult } from './hooks/use-radarr-panel-controller';
import type { UseSonarrPanelControllerResult } from './hooks/use-sonarr-panel-controller';

export interface MappingTabProps {
  aniListEntry: MappingAniListSummary;
  currentMapping: MappingSearchResult | null;
  overrideActive: boolean;
  otherAniListIds: number[];
  provider: "sonarr" | "radarr";
  controller: UseMappingControllerResult;
  baseUrl: string;
}

export type SonarrPanelMode = "add" | "edit";
export type RadarrPanelMode = "add" | "edit";

export interface SonarrPanelBaseProps {
  mode: SonarrPanelMode;

  anilistId: number;
  title: string;
  tvdbId: number | null;
  folderSlug?: string | null;

  initialForm: SonarrFormState;
  defaultForm: SonarrFormState;

  metadata: {
    qualityProfiles: ProviderQualityProfile[];
    rootFolders: ProviderRootFolder[];
    tags: ProviderTag[];
  } | null;

  sonarrReady: boolean;
  disabled?: boolean;

  portalContainer?: HTMLElement | ShadowRoot | null;

  onSubmit(form: SonarrFormState): Promise<void>;
  onSaveDefaults(form: SonarrFormState): Promise<void>;
}

export type SonarrPanelProps = SonarrPanelBaseProps & {
  controller: UseSonarrPanelControllerResult;
};

export interface RadarrPanelBaseProps {
  mode: RadarrPanelMode;

  anilistId: number;
  title: string;
  tmdbId: number | null;
  folderSlug?: string | null;

  initialForm: RadarrFormState;
  defaultForm: RadarrFormState;

  metadata: {
    qualityProfiles: ProviderQualityProfile[];
    rootFolders: ProviderRootFolder[];
    tags: ProviderTag[];
  } | null;

  radarrReady: boolean;
  disabled?: boolean;

  portalContainer?: HTMLElement | ShadowRoot | null;

  onSubmit(form: RadarrFormState): Promise<void>;
  onSaveDefaults(form: RadarrFormState): Promise<void>;
}

export type RadarrPanelProps = RadarrPanelBaseProps & {
  controller: UseRadarrPanelControllerResult;
};
