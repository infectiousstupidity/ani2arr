// src/features/media-modal/components/media-modal.tsx
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, ModalContent } from '@/shared/components/modal';
import { Header, type MediaModalTabId } from './media-modal-header';
import { Footer } from './media-modal-footer';

import MappingTab, { type MappingTabProps } from '../tabs/mapping-tab';
import SonarrTab, { type SonarrTabProps } from '../tabs/sonarr-tab';

export type FooterState = {
  leftContent?: ReactNode;

  primaryLabel: string;
  primaryDisabled: boolean;
  primaryLoading: boolean;
  onPrimaryClick: () => void;

  showTertiary: boolean;
  tertiaryLabel: string;
  onTertiaryClick: (() => void) | undefined;
};

export type SetFooterState = (state: FooterState | null) => void;
export type ConfigureFooter = SetFooterState;

export type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  bannerImage: string;
  coverImage: string;
  anilistIds: number[];
  tvdbId?: number | null;
  inLibrary: boolean;

  initialTab?: MediaModalTabId;

  portalContainer?: HTMLElement | null;

  mappingTabProps: MappingTabProps;
  sonarrTabProps: SonarrTabProps;
};

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
  const {
    isOpen,
    onClose,
    title,
    bannerImage,
    coverImage,
    anilistIds,
    tvdbId,
    inLibrary,
    initialTab = "series",
    portalContainer,
    mappingTabProps,
    sonarrTabProps,
  } = props;

  const [activeTab, setActiveTab] = useState<MediaModalTabId>(initialTab);
  const [footerState, setFooterState] = useState<FooterState | null>(null);

  const handleClose = useCallback(() => {
    setFooterState(null);
    onClose();
  }, [onClose]);

  const handleTabChange = useCallback((tab: MediaModalTabId) => {
    setActiveTab(tab);
    setFooterState(null);
  }, []);

  const setFooterStateFromTab: SetFooterState = useCallback((state) => {
    setFooterState(state);
  }, []);

  if (!isOpen) {
    return null;
  }

  let tabContent: ReactNode;

  if (activeTab === "mapping") {
    tabContent = (
      <MappingTab
        {...mappingTabProps}
        setFooterState={setFooterStateFromTab}
      />
    );
  } else {
    tabContent = (
      <SonarrTab
        {...sonarrTabProps}
        setFooterState={setFooterStateFromTab}
      />
    );
  }

  return (
    <Modal open={isOpen} onOpenChange={handleClose}>
      <ModalContent
        container={portalContainer ?? undefined}
        className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border-primary bg-bg-secondary shadow-2xl shadow-black/40 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <Header
          title={title}
          bannerImage={bannerImage}
          coverImage={coverImage}
          anilistIds={anilistIds}
          tvdbId={tvdbId ?? null}
          inLibrary={inLibrary}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onClose={handleClose}
        />
        <div className="px-6 py-5">{tabContent}</div>

        {footerState && (
          <Footer
            leftContent={footerState.leftContent}
            primaryLabel={footerState.primaryLabel}
            primaryDisabled={footerState.primaryDisabled ?? false}
            primaryLoading={footerState.primaryLoading ?? false}
            onPrimaryClick={footerState.onPrimaryClick}
            secondaryLabel="Cancel"
            onSecondaryClick={handleClose}
            showTertiary={footerState.showTertiary}
            tertiaryLabel={footerState.tertiaryLabel}
            onTertiaryClick={footerState.onTertiaryClick}
          />
        )}
      </ModalContent>
    </Modal>
  );
}
