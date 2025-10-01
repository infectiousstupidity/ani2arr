// src/ui/AddSeriesModal.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAddSeriesManager } from '@/hooks/use-add-series-manager';
import { useTheme } from '@/hooks/use-theme';
import { Modal, ModalContent, ModalTitle, ModalFooter } from '@/ui/Modal';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross1Icon, ExternalLinkIcon } from '@radix-ui/react-icons';
import Button from '@/ui/Button';
import SonarrForm from '@/ui/SonarrForm';

interface AddSeriesModalProps {
  anilistId: number;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  portalContainer?: HTMLElement | null;
}

const AddSeriesModal: React.FC<AddSeriesModalProps> = ({
  anilistId,
  title,
  isOpen,
  onClose,
  portalContainer,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [selectPortal, setSelectPortal] = useState<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const manager = useAddSeriesManager(anilistId, title, isOpen);
  const sonarrReady = manager.sonarrReady;

  useTheme(hostRef);

  useEffect(() => {
    if (!manager.addSeriesState.isSuccess) return;
    const timer = setTimeout(() => onClose(), 1500);
    return () => clearTimeout(timer);
  }, [manager.addSeriesState.isSuccess, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!manager.formState || !manager.sonarrMetadata.data) return;
    if (!initialFocusRef.current) return;
    const id = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen, manager.formState, manager.sonarrMetadata.data]);

  const handleSelectPortalRef = useCallback((node: HTMLDivElement | null) => {
    setSelectPortal(node);
  }, []);

  const tooltipPortal = selectPortal ?? undefined;

  return (
    <div ref={hostRef}>
      <Modal open={isOpen} onOpenChange={onClose}>
        <ModalContent
          container={portalContainer ?? undefined}
          className="mx-auto max-w-none"
          onOpenAutoFocus={event => {
            event.preventDefault();
          }}
        >
          <ModalTitle id="modal-title" className="">
            {title}
          </ModalTitle>
          <Dialog.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 text-text-primary transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:pointer-events-none"
            aria-label="Close"
          >
            <Cross1Icon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
          <div className="flex items-center ml-auto">
            <Button
              variant="ghost"
              size="icon"
              tooltip="Open in new tab"
              portalContainer={tooltipPortal}
              aria-label="Open options page"
              onClick={() => browser.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', timestamp: Date.now() })}
              className="text-text-secondary"
            >
              <ExternalLinkIcon />
            </Button>
          </div>
          {!sonarrReady ? (
            <div className="p-8 text-center text-text-secondary">Configure Sonarr to enable adding series.</div>
          ) : manager.isLoading || !manager.formState || !manager.sonarrMetadata.data ? (
            <div className="p-8 text-center text-text-secondary">Loading Sonarr settings...</div>
          ) : (
            <>
              <SonarrForm
                options={manager.formState}
                data={manager.sonarrMetadata.data}
                onChange={manager.handleFormChange}
                disabled={manager.addSeriesState.isPending || manager.addSeriesState.isSuccess}
                portalContainer={selectPortal}
                initialFocusRef={initialFocusRef}
              />
              <ModalFooter className="mt-4">
                {manager.isDirty && (
                  <Button
                    variant="outline"
                    onClick={manager.handleSaveDefaults}
                    isLoading={manager.saveDefaultsState.isPending}
                    disabled={manager.addSeriesState.isPending}
                    aria-busy={manager.saveDefaultsState.isPending}
                  >
                    Save as Default
                  </Button>
                )}
                <Button
                  onClick={manager.handleAddSeries}
                  isLoading={manager.addSeriesState.isPending}
                  disabled={!sonarrReady || manager.addSeriesState.isSuccess}
                  className="w-32"
                  aria-busy={manager.addSeriesState.isPending}
                >
                  {manager.addSeriesState.isSuccess ? 'Added!' : 'Add Series'}
                </Button>
              </ModalFooter>
            </>
          )}

          <div id="kitsunarr-select-portal-container" ref={handleSelectPortalRef} />
        </ModalContent>
      </Modal>
    </div>
  );
};

export default AddSeriesModal;

