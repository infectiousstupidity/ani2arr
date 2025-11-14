import type { MappingSearchResult } from '@/shared/types';
import { ProviderSearchSection } from './provider-search-section';
import { CurrentMappingSection } from './current-mapping-section';
import { SelectedResultPreview } from './selected-result-preview';
import type { UseMappingControllerResult } from './hooks/use-mapping-controller';

export interface AniListEntrySummary {
  id: number;
  title: string;
  seasonLabel?: string;
  posterUrl?: string;
}

interface MappingTabLayoutProps {
  aniListEntry: AniListEntrySummary;
  currentMapping: MappingSearchResult | null;
  otherAniListIds: number[];
  controller: UseMappingControllerResult;
  baseUrl: string;
}

export function MappingTabLayout(props: MappingTabLayoutProps) {
  const { aniListEntry, currentMapping, otherAniListIds, controller, baseUrl } = props;
  return (
    <div className="flex flex-col gap-4">
      <CurrentMappingSection
        aniListEntry={aniListEntry}
        currentMapping={currentMapping}
        otherAniListIds={otherAniListIds}
        baseUrl={baseUrl}
      />

      <div className="grid grid-cols-2 gap-4">
        <ProviderSearchSection
          controller={controller}
          currentMapping={currentMapping}
          baseUrl={baseUrl}
        />
        <SelectedResultPreview
          selected={controller.state.selected}
          baseUrl={baseUrl}
        />
      </div>
    </div>
  );
}
