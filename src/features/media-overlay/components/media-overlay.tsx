import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePublicOptions } from '@/shared/api';
import { useA2aBroadcasts } from '@/shared/hooks/use-broadcasts';
import { useTheme } from '@/shared/hooks/common/use-theme';
import { useBrowsePortals } from '../hooks/use-media-portals';
import { useAnilistBatchPrefetch } from '@/shared/hooks/entrypoints/use-anilist-batch-prefetch';
import type { BrowseAdapter, ParsedCard, MediaMetadataHint } from '@/shared/types';
import { CardOverlay } from './card-overlay';

export const DEFAULT_CONTAINER_CLASS = 'a2a-overlay-container';
export const DEFAULT_PROCESSED_ATTRIBUTE = 'data-a2a-processed';

export interface BrowseContentAppProps {
  onOpenMediaModal(input: {
    anilistId: number;
    title: string;
    initialTab?: 'series' | 'mapping';
    metadata: MediaMetadataHint | null;
  }): void;
}

export const createBrowseContentApp = (adapter: BrowseAdapter): React.FC<BrowseContentAppProps> => {
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

  const BrowseContentApp: React.FC<BrowseContentAppProps> = ({ onOpenMediaModal }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    useTheme(hostRef);
    useA2aBroadcasts();

    const { data: publicOptions } = usePublicOptions();
    const isConfigured = Boolean(publicOptions?.isConfigured);
    const sonarrUrl = publicOptions?.sonarrUrl ?? null;
    const defaultForm = publicOptions?.defaults ?? null;
    const overlaysEnabled = publicOptions?.ui?.browseOverlayEnabled ?? true;
    const badgeVisibility = publicOptions?.ui?.badgeVisibility ?? 'always';

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
      enabled: overlaysEnabled,
    });

    // Prefetch AniList metadata on browse/search pages using viewport-prioritized batching.
    useAnilistBatchPrefetch({ cardPortals, enabled: overlaysEnabled });

    if (!overlaysEnabled) {
      return <div ref={hostRef} />;
    }

    return (
      <div ref={hostRef}>
        {Array.from(cardPortals.entries()).map(([container, parsed]) =>
          createPortal(
            <CardOverlay
              key={parsed.anilistId}
              anilistId={parsed.anilistId}
              title={parsed.title}
              onOpenModal={(anilistId, title, metadata) =>
                onOpenMediaModal({
                  anilistId,
                  title,
                  initialTab: 'series',
                  metadata,
                })
              }
              onOpenMappingFix={(anilistId, title) =>
                onOpenMediaModal({
                  anilistId,
                  title,
                  initialTab: 'mapping',
                  metadata: parsed.metadata,
                })
              }
              isConfigured={isConfigured}
              defaultForm={defaultForm}
              metadata={parsed.metadata}
              sonarrUrl={sonarrUrl}
              observeTarget={container}
              badgeVisibility={badgeVisibility}
              anchorCorner={adapter?.anchorCorner ?? 'bottom-left'}
              stackDirection={adapter?.stackDirection ?? 'up'}
              anchorOffsetX={adapter?.anchorOffsetX ?? -8}
            />,
            container,
          ),
        )}
      </div>
    );
  };

  return BrowseContentApp;
};

export { CardOverlay } from './card-overlay';
export type { BrowseAdapter, ParsedCard, CardOverlayProps } from '@/shared/types';
