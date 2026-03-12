// src/features/media-modal/types.ts
import type {
  RadarrFormState,
  RadarrQualityProfile,
  RadarrRootFolder,
  RadarrTag,
  SonarrFormState,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrTag,
} from "@/shared/types";
import type { UseMappingControllerResult } from "@/features/mapping";
import type { UseRadarrPanelControllerResult } from "./hooks/use-radarr-panel-controller";
import type { UseSonarrPanelControllerResult } from "./hooks/use-sonarr-panel-controller";
import type { MappingAniListSummary } from "@/features/mapping";

export interface MappingTabProps {
  aniListEntry: MappingAniListSummary;
  currentMapping: import("@/shared/types").MappingSearchResult | null;
  overrideActive: boolean;
  otherAniListIds: number[];
  service: "sonarr" | "radarr";
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
    qualityProfiles: SonarrQualityProfile[];
    rootFolders: SonarrRootFolder[];
    tags: SonarrTag[];
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
    qualityProfiles: RadarrQualityProfile[];
    rootFolders: RadarrRootFolder[];
    tags: RadarrTag[];
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
