/** Browse overlay composition for parsed cards, metadata hints, and action portals. */
// src/features/media-overlay/components/media-overlay.tsx

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { mergeMetadataHints, metadataHintFromAniListMetadata } from '@/shared/anilist/media-metadata';
import { useAniListMetadataBatch } from '@/shared/queries';
import { useA2aBroadcasts } from '@/runtime/messaging/use-broadcasts';
import { useTheme } from '@/shared/hooks/common/use-theme';
import { useBrowsePortals } from '../hooks/use-media-portals';
import { useAnilistBatchPrefetch } from '../hooks/use-anilist-batch-prefetch';
import type { AniListMediaHint } from '@/shared/schemas/anilist/anilist-media.schema';
import type { BrowseAdapter, ParsedCard } from '@/features/media-overlay/types';
import { resolveProviderForAniListFormat } from '@/providers/provider-routing';
import { CardOverlay } from './card-overlay';
import { usePublicOptions } from '@/options';

export const DEFAULT_CONTAINER_CLASS = 'a2a-overlay-container';
export const DEFAULT_PROCESSED_ATTRIBUTE = 'data-a2a-processed';

export interface BrowseContentAppProps {
  onOpenMediaModal(input: {
    anilistId: number;
    title: string;
    initialTab?: 'series' | 'mapping';
    initialMappingRequired?: boolean;
    metadata: AniListMediaHint | null;
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

  const ensureContainerImpl = adapter.ensureContainer ?? ((host: HTMLElement) => {
        const existing = host.querySelector<HTMLElement>(`.${containerClassName}`);
        if (existing) return existing;
        const el = host.ownerDocument.createElement('div');
        el.className = containerClassName;
        host.append(el);
        return el;
      });

  const getContainerForCardImpl = adapter.getContainerForCard ??
    ((card: Element) => card.querySelector<HTMLElement>(`.${containerClassName}`));

  const markProcessedImpl = adapter.markProcessed ?? ((host: HTMLElement, parsed: ParsedCard) => {
        host.setAttribute(processedAttribute, String(parsed.anilistId));
      });

  const clearProcessedImpl = adapter.clearProcessed ?? ((host: HTMLElement) => {
        host.removeAttribute(processedAttribute);
      });

  const getObserverRoot = adapter.getObserverRoot ?? (() => document.body ?? document.documentElement);

  const getScanRoot = adapter.getScanRoot ??
    (() => (document.querySelector<HTMLElement>('.page-content') ?? document.body ?? null));

  const getResizeTargets = adapter.resizeObserverTargets ?? (() => (document.body ? [document.body] : []));

  const containerSelector = `.${containerClassName}`;

  const BrowseContentApp: React.FC<BrowseContentAppProps> = ({ onOpenMediaModal }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    useTheme(hostRef);
    useA2aBroadcasts();

    const { data: publicOptions } = usePublicOptions();
    const sonarrBrowseEnabled = publicOptions?.ui?.browseCards.sonarr.enabled ?? true;
    const radarrBrowseEnabled = publicOptions?.ui?.browseCards.radarr.enabled ?? true;
    const overlaysEnabled = sonarrBrowseEnabled || radarrBrowseEnabled;
    const metadataEnabled = Boolean(
      (sonarrBrowseEnabled && publicOptions?.providers.sonarr.isConfigured) ||
        (radarrBrowseEnabled && publicOptions?.providers.radarr.isConfigured),
    );

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
    const metadataIds = [...new Set(Array.from(cardPortals.values(), parsed => parsed.anilistId))];
    const metadataBatch = useAniListMetadataBatch(metadataIds, { enabled: metadataEnabled });
    const canonicalMetadataById = new Map(
      (metadataBatch.data?.metadata ?? []).map(entry => [entry.id, metadataHintFromAniListMetadata(entry)]),
    );

    // Prefetch AniList metadata on browse/search pages using viewport-prioritized batching.
    useAnilistBatchPrefetch({ cardPortals, enabled: metadataEnabled });

    if (!overlaysEnabled) {
      return <div ref={hostRef} />;
    }

    return (
      <div ref={hostRef}>
        {[...cardPortals.entries()].map(([container, parsed]) => {
          const effectiveMetadata = mergeMetadataHints(
            canonicalMetadataById.get(parsed.anilistId) ?? null,
            parsed.metadata,
          );
          const provider = resolveProviderForAniListFormat(effectiveMetadata?.format ?? null);
          if (!provider) {
            return null;
          }
          const providerOptions =
            provider === 'radarr' ? publicOptions?.providers.radarr : publicOptions?.providers.sonarr;
          const providerUiOptions =
            provider === 'radarr' ? publicOptions?.ui?.browseCards.radarr : publicOptions?.ui?.browseCards.sonarr;
          const providerBrowseEnabled = providerUiOptions?.enabled ?? true;
          if (!providerBrowseEnabled) {
            return null;
          }
          const badgeVisibility = providerUiOptions?.visibility ?? 'always';

          return createPortal(
            <CardOverlay
              key={parsed.anilistId}
              provider={provider}
              anilistId={parsed.anilistId}
              title={parsed.title}
              onOpenModal={(anilistId, title) =>
                onOpenMediaModal({
                  anilistId,
                  title,
                  initialTab: 'series',
                  metadata: effectiveMetadata,
                })
              }
              onOpenMappingFix={(anilistId, title, mappingRequired) =>
                onOpenMediaModal({
                  anilistId,
                  title,
                  initialTab: 'mapping',
                  initialMappingRequired: mappingRequired ?? false,
                  metadata: effectiveMetadata,
                })
              }
              isConfigured={Boolean(providerOptions?.isConfigured)}
              defaultForm={providerOptions?.defaults ?? null}
              metadata={effectiveMetadata}
              providerUrl={providerOptions?.url ?? null}
              observeTarget={container}
              badgeVisibility={badgeVisibility}
              anchorCorner={adapter?.anchorCorner ?? 'bottom-left'}
              stackDirection={adapter?.stackDirection ?? 'up'}
              anchorOffsetX={adapter?.anchorOffsetX ?? -8}
            />,
            container,
          );
        })}
      </div>
    );
  };

  return BrowseContentApp;
};

export { CardOverlay } from './card-overlay';
