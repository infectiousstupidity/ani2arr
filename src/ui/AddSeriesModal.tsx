// src/ui/AddSeriesModal.tsx
import React, { useEffect, useRef } from 'react';
import { useAddSeriesManager } from '@/hooks/use-add-series-manager';
import { useTheme } from '@/hooks/use-theme';
import { Modal, ModalContent, ModalTitle, ModalFooter } from '@/ui/Modal';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross1Icon, ExternalLinkIcon } from '@radix-ui/react-icons';
import Button from '@/ui/Button';
import SonarrForm from '@/ui/SonarrForm';
import { TooltipProvider } from '@radix-ui/react-tooltip';

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
  portalContainer 
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const manager = useAddSeriesManager(anilistId, title, isOpen);
  
  useTheme(hostRef);

  useEffect(() => {
    if (!manager.addSeriesState.isSuccess) return;
    const timer = setTimeout(() => onClose(), 1500);
    return () => clearTimeout(timer);
  }, [manager.addSeriesState.isSuccess, onClose]);

  return (
    <TooltipProvider>
    <div ref={hostRef}>
      <Modal open={isOpen} onOpenChange={onClose}>
        <ModalContent 
          container={portalContainer || undefined} 
          className="mx-auto max-w-none"
        >
          <ModalTitle id="modal-title" className="">{title}</ModalTitle>
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
              onClick={() => browser.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', timestamp: Date.now() })}
              className="text-text-secondary"
            >
              <ExternalLinkIcon />
            </Button>
          </div>
          {manager.isLoading || !manager.formState || !manager.sonarrMetadata.data ? (
            <div className="p-8 text-center text-text-secondary">Loading Sonarr settings...</div>
          ) : (
            <>
              <SonarrForm
                options={manager.formState}
                data={manager.sonarrMetadata.data}
                onChange={manager.handleFormChange}
                disabled={manager.addSeriesState.isPending || manager.addSeriesState.isSuccess}
              />
              <ModalFooter className="mt-4">
                {manager.isDirty && (
                  <Button
                    variant="outline"
                    onClick={manager.handleSaveDefaults}
                    isLoading={manager.saveDefaultsState.isPending}
                    disabled={manager.addSeriesState.isPending}
                  >
                    Save as Default
                  </Button>
                )}
                <Button
                  onClick={manager.handleAddSeries}
                  isLoading={manager.addSeriesState.isPending}
                  disabled={manager.addSeriesState.isSuccess}
                  className="w-32"
                >
                  {manager.addSeriesState.isSuccess ? 'Added!' : 'Add Series'}
                </Button>
              </ModalFooter>
            </>
          )}

          {/* This stable element will host the select dropdowns inside the modal's shadow DOM */}
          <div id="kitsunarr-select-portal-container" />
        </ModalContent>
      </Modal>
    </div>
    </TooltipProvider>
  );
};

export default AddSeriesModal;