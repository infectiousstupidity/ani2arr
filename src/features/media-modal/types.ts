// src/features/media-modal/types.ts
import type {
  SonarrFormState,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrTag,
} from "@/shared/types";
import type { UseMappingControllerResult } from "./hooks/use-mapping-controller";
import type { UseSonarrPanelControllerResult } from "./hooks/use-sonarr-panel-controller";

export interface AniListEntrySummary {
  id: number;
  title: string;
  seasonLabel?: string;
  posterUrl?: string;
}

export interface MappingTabProps {
  aniListEntry: AniListEntrySummary;
  currentMapping: import("@/shared/types").MappingSearchResult | null;
  overrideActive: boolean;
  otherAniListIds: number[];
  service: "sonarr" | "radarr";
  controller: UseMappingControllerResult;
  baseUrl: string;
}

export type SonarrPanelMode = "add" | "edit";

export interface SonarrPanelBaseProps {
  mode: SonarrPanelMode;

  anilistId: number;
  title: string;
  tvdbId: number | null;

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
