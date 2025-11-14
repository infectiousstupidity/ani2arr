import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePublicOptions } from '@/shared/hooks/use-api-queries';
import { useA2aBroadcasts } from '@/shared/hooks/use-broadcasts';
import { useTheme } from '@/shared/hooks/use-theme';
import { useBrowsePortals } from '../hooks/use-media-portals';
import { useAnilistBatchPrefetch } from '@/shared/hooks/use-anilist-batch-prefetch';
import type { BrowseAdapter, ModalState, ParsedCard } from '@/shared/types';
import { CardOverlay } from './card-overlay';

const AddSeriesModal = React.lazy(() => import('@/shared/components/add-series-modal'));
const MappingFixModal = React.lazy(() => import('@/shared/components/mapping-modal'));

export const DEFAULT_CONTAINER_CLASS = 'a2a-overlay-container';
export const DEFAULT_PROCESSED_ATTRIBUTE = 'data-a2a-processed';

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
    useA2aBroadcasts();

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

    // Prefetch AniList metadata on browse/search pages using viewport-prioritized batching.
    useAnilistBatchPrefetch({ cardPortals });

    const [modalState, setModalState] = useState<ModalState | null>(null);
    const [mappingFixState, setMappingFixState] = useState<{
      anilistId: number;
      title: string;
      overrideActive?: boolean;
    } | null>(null);

    const handleOpenModal = useCallback((anilistId: number, title: string, metadata: ModalState['metadata']) => {
      setModalState({ anilistId, title, metadata });
    }, []);

    const handleCloseModal = useCallback(() => setModalState(null), []);

    const handleOpenMappingFix = useCallback((anilistId: number, title: string, overrideActive?: boolean) => {
      setMappingFixState(
        overrideActive === undefined
          ? { anilistId, title }
          : { anilistId, title, overrideActive }
      );
    }, []);

    const handleCloseMappingFix = useCallback(() => setMappingFixState(null), []);

    return (
      <div ref={hostRef}>
        {Array.from(cardPortals.entries()).map(([container, parsed]) =>
          createPortal(
            <CardOverlay
              anilistId={parsed.anilistId}
              title={parsed.title}
              onOpenModal={handleOpenModal}
              onOpenMappingFix={handleOpenMappingFix}
              isConfigured={isConfigured}
              defaultForm={defaultForm}
              metadata={parsed.metadata}
              sonarrUrl={sonarrUrl}
              observeTarget={container}
              anchorCorner={adapter?.anchorCorner ?? 'bottom-left'}
              stackDirection={adapter?.stackDirection ?? 'up'}
              anchorOffsetX={adapter?.anchorOffsetX ?? -8}
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
          {mappingFixState &&
            React.createElement(MappingFixModal, {
              anilistId: mappingFixState.anilistId,
              title: mappingFixState.title,
              isOpen: true,
              onClose: handleCloseMappingFix,
              ...(mappingFixState.overrideActive === undefined
                ? {}
                : { overrideActive: mappingFixState.overrideActive }),
              portalContainer: (hostRef.current as HTMLElement | null) ?? null,
            })}
        </React.Suspense>
      </div>
    );
  };

  return BrowseContentApp;
};

export { CardOverlay } from './card-overlay';
export type { BrowseAdapter, ModalState, ParsedCard, CardOverlayProps } from '@/shared/types';
