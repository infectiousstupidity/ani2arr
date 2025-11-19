import type {
  SonarrFormState,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrTag,
} from "@/shared/types";
import { SonarrTabLayout } from "./sonarr-tab-layout";
import type { UseSonarrTabControllerResult } from "./hooks/use-sonarr-tab-controller";

export type SonarrTabMode = "add" | "edit";

export interface SonarrTabProps {
  mode: SonarrTabMode;

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

  portalContainer?: HTMLElement | null;

  onSubmit(form: SonarrFormState): Promise<void>;
  onSaveDefaults(form: SonarrFormState): Promise<void>;
  controller: UseSonarrTabControllerResult;
}

// Pure layout component - no hooks, no state, no effects
export default function SonarrTab(props: SonarrTabProps): React.JSX.Element {
  const {
    mode,
    title,
    tvdbId,
    metadata,
    sonarrReady,
    disabled,
    portalContainer,
    controller,
  } = props;

  return (
    <SonarrTabLayout
      mode={mode}
      title={title}
      tvdbId={tvdbId}
      controller={controller}
      metadata={metadata}
      sonarrReady={sonarrReady}
      disabled={disabled ?? false}
      portalContainer={portalContainer ?? null}
    />
  );
}
