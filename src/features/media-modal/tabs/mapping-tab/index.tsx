import type { MappingSearchResult } from "@/shared/types";
import {
  MappingTabLayout,
  type AniListEntrySummary,
} from "./mapping-tab-layout";
import type { UseMappingControllerResult } from "./hooks/use-mapping-controller";


export interface MappingTabProps {
  aniListEntry: AniListEntrySummary;
  currentMapping: MappingSearchResult | null;
  overrideActive: boolean;
  otherAniListIds: number[];
  service: "sonarr" | "radarr";
  controller: UseMappingControllerResult;
  baseUrl: string;
}

export { type AniListEntrySummary };

// Pure layout component - no hooks, no state, no effects
export default function MappingTab(props: MappingTabProps): React.JSX.Element {
  const {
    aniListEntry,
    currentMapping,
    otherAniListIds,
    controller,
    baseUrl,
  } = props;

  return (
    <MappingTabLayout
      aniListEntry={aniListEntry}
      currentMapping={currentMapping}
      otherAniListIds={otherAniListIds}
      controller={controller}
      baseUrl={baseUrl}
    />
  );
}
