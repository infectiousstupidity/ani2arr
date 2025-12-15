import React from 'react';
import type { BrowseContentAppProps } from '@/features/media-overlay';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalState } from '@/features/media-modal/hooks/use-media-modal-state';
import { useMediaModalProps } from '@/shared/hooks/use-media-modal-props';
import { usePublicOptions } from '@/shared/hooks/use-api-queries';
import { useToast } from '@/shared/components/toast-provider';

export interface BrowseRootProps {
  BrowseContentApp: React.FC<BrowseContentAppProps>;
  portalContainer: HTMLElement;
  includeModalKey?: boolean;
}

export const BrowseRoot: React.FC<BrowseRootProps> = ({ BrowseContentApp, portalContainer, includeModalKey }) => {
  const mediaModal = useMediaModalState();
  const { data: options } = usePublicOptions();
  const modalEnabled = options?.ui?.modalEnabled ?? true;
  const toast = useToast();

  const modalProps = useMediaModalProps({
    anilistId: mediaModal.state?.anilistId,
    title: mediaModal.state?.title,
    metadata: mediaModal.state?.metadata,
    portalContainer,
    isOpen: mediaModal.state?.isOpen ?? false,
  });

  return (
    <>
      <BrowseContentApp
        onOpenMediaModal={({ anilistId, title, initialTab, metadata }) => {
          if (!modalEnabled) {
            toast.showToast({
              title: 'Modal disabled',
              description: 'Enable the ani2arr modal in Options to open mapping/setup here.',
              variant: 'info',
            });
            return;
          }
          mediaModal.open({ anilistId, title, initialTab: initialTab ?? 'series', metadata });
        }}
      />
      {modalEnabled && portalContainer && mediaModal.state && modalProps && (
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
          tvdbId={modalProps.tvdbId}
          inLibrary={modalProps.inLibrary}
          format={modalProps.format}
          year={modalProps.year}
          status={modalProps.status}
          initialTab={mediaModal.state.initialTab ?? 'series'}
          portalContainer={portalContainer}
          mappingTabProps={modalProps.mappingTabProps}
          sonarrPanelProps={modalProps.sonarrPanelProps}
        />
      )}
    </>
  );
};
