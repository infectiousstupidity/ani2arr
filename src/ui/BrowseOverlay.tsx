import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePublicOptions } from '@/hooks/use-api-queries';
import { useKitsunarrBroadcasts } from '@/hooks/use-broadcasts';
import { useTheme } from '@/hooks/use-theme';
import { useBrowsePortals } from '@/hooks/use-browse-portals';
import type { BrowseAdapter, ModalState, ParsedCard } from '@/types';
import { CardOverlay } from '@/ui/CardOverlay';

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

export const DEFAULT_CONTAINER_CLASS = 'kitsunarr-overlay-container';
export const DEFAULT_PROCESSED_ATTRIBUTE = 'data-kitsunarr-processed';

export const createBrowseContentApp = (adapter: BrowseAdapter): React.FC => {
  const {
    cardSelector,
    containerClassName = DEFAULT_CONTAINER_CLASS,
    processedAttribute = DEFAULT_PROCESSED_ATTRIBUTE,
    mutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] },
    parseCard,
  } = adapter;

  const ensureContainerImpl = adapter.ensureContainer
    ? adapter.ensureContainer
    : (host: HTMLElement) => {
        const existing = host.querySelector<HTMLElement>(`.${containerClassName}`);
        if (existing) return existing;
        const el = host.ownerDocument.createElement('div');
        el.className = containerClassName;
        host.appendChild(el);
        return el;
      };

  const getContainerForCardImpl = adapter.getContainerForCard
    ? adapter.getContainerForCard
    : (card: Element) => card.querySelector<HTMLElement>(`.${containerClassName}`);

  const markProcessedImpl = adapter.markProcessed
    ? adapter.markProcessed
    : (host: HTMLElement, parsed: ParsedCard) => {
        host.setAttribute(processedAttribute, String(parsed.anilistId));
      };

  const clearProcessedImpl = adapter.clearProcessed
    ? adapter.clearProcessed
    : (host: HTMLElement) => {
        host.removeAttribute(processedAttribute);
      };

  const getObserverRoot = adapter.getObserverRoot
    ? adapter.getObserverRoot
    : () => document.body ?? document.documentElement;

  const getScanRoot = adapter.getScanRoot
    ? adapter.getScanRoot
    : () => (document.querySelector<HTMLElement>('.page-content') ?? document.body ?? null);

  const getResizeTargets = adapter.resizeObserverTargets
    ? adapter.resizeObserverTargets
    : () => (document.body ? [document.body] : []);

  const containerSelector = `.${containerClassName}`;

  const BrowseContentApp: React.FC = () => {
    const hostRef = useRef<HTMLDivElement>(null);
    useTheme(hostRef);
    useKitsunarrBroadcasts();

    const { data: publicOptions } = usePublicOptions();
    const isConfigured = Boolean(publicOptions?.isConfigured);
    const sonarrUrl = publicOptions?.sonarrUrl ?? null;
    const defaultForm = publicOptions?.defaults ?? null;

    const { cardPortals } = useBrowsePortals({
      cardSelector,
      containerSelector,
      parseCard,
      ensureContainer: ensureContainerImpl,
      getContainerForCard: getContainerForCardImpl,
      markProcessed: markProcessedImpl,
      clearProcessed: clearProcessedImpl,
      getObserverRoot,
      getScanRoot,
      getResizeTargets,
      mutationObserverInit,
      onCardInvalid: adapter.onCardInvalid,
    });

    const [modalState, setModalState] = useState<ModalState | null>(null);

    const handleOpenModal = useCallback((anilistId: number, title: string, metadata: ModalState['metadata']) => {
      setModalState({ anilistId, title, metadata });
    }, []);

    const handleCloseModal = useCallback(() => setModalState(null), []);

    return (
      <div ref={hostRef}>
        {Array.from(cardPortals.entries()).map(([container, parsed]) =>
          createPortal(
            <CardOverlay
              anilistId={parsed.anilistId}
              title={parsed.title}
              onOpenModal={handleOpenModal}
              isConfigured={isConfigured}
              defaultForm={defaultForm}
              metadata={parsed.metadata}
              sonarrUrl={sonarrUrl}
            />,
            container,
          ),
        )}

        <React.Suspense fallback={null}>
          {modalState &&
            React.createElement(AddSeriesModal, {
              anilistId: modalState.anilistId,
              title: modalState.title,
              isOpen: true,
              onClose: handleCloseModal,
              portalContainer: (hostRef.current as HTMLElement | null) ?? null,
              metadata: modalState.metadata,
            })}
        </React.Suspense>
      </div>
    );
  };

  return BrowseContentApp;
};

export { CardOverlay } from '@/ui/CardOverlay';
export type { BrowseAdapter, ModalState, ParsedCard, CardOverlayProps } from '@/types';
