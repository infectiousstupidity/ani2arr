import type { MappingSearchResult, MappingTargetId } from '@/shared/types';
import { usePublicOptions } from '@/shared/hooks/use-api-queries';
import type { FooterState, SetFooterState } from '@/features/media-modal/components/media-modal';
import { useMediaModalFooter } from '@/features/media-modal/hooks/use-media-modal-footer';
import { MappingTabLayout, type AniListEntrySummary } from './mapping-tab-layout';
import { useMappingController } from './hooks/use-mapping-controller';


export interface MappingTabProps {
  aniListEntry: AniListEntrySummary;
  currentMapping: MappingSearchResult | null;
  otherAniListIds: number[];
  service: 'sonarr' | 'radarr';
  onSubmitOverride(target: MappingTargetId): Promise<void>;
  onRevertToAutomatic(): Promise<void>;
  setFooterState: SetFooterState;
}

export default function MappingTab(props: MappingTabProps) {
  const {
    aniListEntry,
    currentMapping,
    otherAniListIds,
    service,
    onSubmitOverride,
    onRevertToAutomatic,
    setFooterState,
  } = props;

  const controller = useMappingController({
    service,
    currentMapping,
    onSubmitOverride,
    onRevertToAutomatic,
  });

  const footerState: FooterState = {
    primaryLabel: currentMapping ? 'Override mapping' : 'Save mapping',
    primaryDisabled: !controller.canSubmit,
    primaryLoading: controller.isSubmitting,
    onPrimaryClick: () => {
      void controller.handleSubmit();
    },
    showTertiary: controller.canRevert,
    tertiaryLabel: 'Revert to automatic',
    onTertiaryClick: controller.canRevert
      ? () => {
          void controller.handleRevertToAutomatic();
        }
      : undefined,
  };

  useMediaModalFooter(setFooterState, footerState);

  const publicOptions = usePublicOptions();
  const baseUrl = publicOptions.data?.sonarrUrl ?? '';
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
