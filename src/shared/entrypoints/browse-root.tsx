import React from 'react';
import type { BrowseContentAppProps } from '@/features/media-overlay';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalState } from '@/features/media-modal/hooks/use-media-modal-state';
import { useMediaModalProps } from '@/shared/hooks/entrypoints/use-media-modal-props';
import { AniListSchedulerDebugOverlay } from './anilist-scheduler-debug-overlay';

export interface BrowseRootProps {
  BrowseContentApp: React.FC<BrowseContentAppProps>;
  portalContainer: HTMLElement;
  includeModalKey?: boolean;
}

export const BrowseRoot: React.FC<BrowseRootProps> = ({ BrowseContentApp, portalContainer, includeModalKey }) => {
  const mediaModal = useMediaModalState();

  const modalProps = useMediaModalProps({
    anilistId: mediaModal.state?.anilistId,
    title: mediaModal.state?.title,
    metadata: mediaModal.state?.metadata,
    portalContainer,
    isOpen: mediaModal.state?.isOpen ?? false,
  });

  return (
    <>
      <AniListSchedulerDebugOverlay />
      <BrowseContentApp
        onOpenMediaModal={({ anilistId, title, initialTab, initialMappingRequired, metadata }) => {
          mediaModal.open({
            anilistId,
            title,
            initialTab: initialTab ?? 'series',
            ...(initialMappingRequired !== undefined ? { initialMappingRequired } : {}),
            metadata,
          });
        }}
      />
      {portalContainer && mediaModal.state && modalProps && (
        <MediaModal
          key={includeModalKey ? `modal-${mediaModal.state.anilistId ?? 'unknown'}` : undefined}
          isOpen={mediaModal.state.isOpen}
          onClose={mediaModal.reset}
          title={modalProps.title}
          alternateTitles={modalProps.alternateTitles}
          titleLanguage={modalProps.titleLanguage}
          bannerImage={modalProps.bannerImage}
          coverImage={modalProps.coverImage}
          anilistIds={[mediaModal.state.anilistId]}
          service={modalProps.service}
          inLibrary={modalProps.inLibrary}
          format={modalProps.format}
          year={modalProps.year}
          status={modalProps.status}
          initialTab={mediaModal.state.initialTab ?? 'series'}
          initialMappingRequired={mediaModal.state.initialMappingRequired ?? false}
          portalContainer={portalContainer}
          mappingTabProps={modalProps.mappingTabProps}
          sonarrPanelProps={modalProps.sonarrPanelProps}
          radarrPanelProps={modalProps.radarrPanelProps}
        />
      )}
    </>
  );
};
