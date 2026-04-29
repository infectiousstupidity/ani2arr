/** Content-owned browse root composition for media modal rendering. */
// src/content/browse/browse-root.tsx

import React from 'react';
import { MediaModal } from '@/features/media-modal';
import { useMediaModalState } from '@/features/media-modal/hooks/use-media-modal-state';
import type { BrowseContentAppProps } from './browse-content-app';

export interface BrowseRootProps {
  BrowseContentApp: React.FC<BrowseContentAppProps>;
  portalContainer: HTMLElement;
  includeModalKey?: boolean;
}

export const BrowseRoot: React.FC<BrowseRootProps> = ({
  BrowseContentApp,
  portalContainer,
  includeModalKey,
}) => {
  const mediaModal = useMediaModalState();

  return (
    <>
      <BrowseContentApp onOpenMediaModal={mediaModal.open} />
      {portalContainer && mediaModal.state ? (
        <MediaModal
          key={includeModalKey ? `modal-${mediaModal.state.anilistId ?? 'unknown'}` : undefined}
          state={mediaModal.state}
          onClose={mediaModal.close}
          container={portalContainer}
        />
      ) : null}
    </>
  );
};
