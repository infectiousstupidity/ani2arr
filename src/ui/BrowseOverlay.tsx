import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { createPortal } from 'react-dom';
import { useAddSeries, useExtensionOptions, useSeriesStatus } from '@/hooks/use-api-queries';
import { useKitsunarrBroadcasts } from '@/hooks/use-broadcasts';
import { useTheme } from '@/hooks/use-theme';
import TooltipWrapper from '@/ui/TooltipWrapper';
import { CheckIcon, ExclamationTriangleIcon, GearIcon, PlusIcon } from '@radix-ui/react-icons';
import type { ExtensionError, SonarrFormState } from '@/types';

const AddSeriesModal = React.lazy(() => import('@/ui/AddSeriesModal'));

export type ModalState = { anilistId: number; title: string };

type OverlayState = 'disabled' | 'in-sonarr' | 'addable' | 'resolving' | 'adding' | 'error';

export interface CardOverlayProps {
  anilistId: number;
  title: string;
  onOpenModal: (anilistId: number, title: string) => void;
  isConfigured: boolean;
  defaultForm: SonarrFormState | null;
}

export interface ParsedCard {
  anilistId: number;
  title: string;
  host: HTMLElement;
}

export interface BrowseAdapter {
  cardSelector: string;
  containerClassName?: string;
  processedAttribute?: string;
  parseCard(card: Element): ParsedCard | null;
  ensureContainer?(host: HTMLElement, card: Element): HTMLElement;
  getContainerForCard?(card: Element): HTMLElement | null;
  markProcessed?(host: HTMLElement, parsed: ParsedCard): void;
  clearProcessed?(host: HTMLElement): void;
  onCardInvalid?(card: Element): void;
  getObserverRoot?(): Node | null;
  getScanRoot?(): Element | null;
  mutationObserverInit?: MutationObserverInit;
  resizeObserverTargets?: () => Iterable<Element> | Element | null;
}

export const DEFAULT_CONTAINER_CLASS = 'kitsunarr-overlay-container';
export const DEFAULT_PROCESSED_ATTRIBUTE = 'data-kitsunarr-processed';

const CardOverlay: React.FC<CardOverlayProps> = memo(({ anilistId, title, onOpenModal, isConfigured, defaultForm }) => {
  const sonarrReady = isConfigured;
  const bypassFailureCacheRef = useRef(false);
  const statusQuery = useSeriesStatus(
    { anilistId, title },
    { enabled: sonarrReady && Number.isFinite(anilistId), ignoreFailureCache: () => bypassFailureCacheRef.current },
  );
  const addSeriesMutation = useAddSeries();

  const {
    data: statusData,
    isError: statusHasError,
    error: statusError,
    isLoading: statusIsLoading,
    fetchStatus,
    refetch,
  } = statusQuery;

  const {
    mutate,
    isPending: isAdding,
    isSuccess: addSuccess,
    isError: addHasError,
    error: addError,
    reset,
  } = addSeriesMutation;

  useEffect(() => {
    reset();
  }, [anilistId, title, reset]);

  const isResolving = statusIsLoading || fetchStatus === 'fetching';
  const mappingUnavailable = statusData?.anilistTvdbLinkMissing === true;
  const hasError = addHasError || statusHasError || mappingUnavailable;
  const alreadyInSonarr = !!statusData?.exists || addSuccess;

  const overlayState: OverlayState = useMemo(() => {
    if (!sonarrReady) return 'disabled';
    if (alreadyInSonarr) return 'in-sonarr';
    if (hasError) return 'error';
    if (isAdding) return 'adding';
    if (isResolving) return 'resolving';
    return 'addable';
  }, [alreadyInSonarr, hasError, isAdding, isResolving, sonarrReady]);

  const resolveErrorMessage = (error: unknown): string | null => {
    if (!error) return null;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'userMessage' in (error as ExtensionError)) {
      const { userMessage } = error as ExtensionError;
      if (typeof userMessage === 'string' && userMessage.trim().length > 0) return userMessage;
    }
    if (error instanceof Error) return error.message;
    return null;
  };

  const errorMessage =
    mappingUnavailable
      ? 'No Sonarr match found. Click to retry mapping.'
      : resolveErrorMessage(addError) ?? resolveErrorMessage(statusError);

  const quickAddDisabled =
    overlayState === 'in-sonarr' ||
    overlayState === 'resolving' ||
    overlayState === 'adding' ||
    overlayState === 'disabled' ||
    (overlayState === 'addable' && !defaultForm);

  const quickAddTitle = (() => {
    switch (overlayState) {
      case 'in-sonarr':
        return 'Already in Sonarr';
      case 'addable':
        return defaultForm ? 'Quick add to Sonarr' : 'Defaults unavailable';
      case 'resolving':
        return 'Resolving series mapping.';
      case 'adding':
        return 'Adding to Sonarr.';
      case 'error':
        return errorMessage ?? 'Retry Sonarr add';
      case 'disabled':
        return 'Configure Sonarr before adding';
      default:
        return 'Sonarr';
    }
  })();

  const quickAddAriaLabel =
    overlayState === 'error' && mappingUnavailable
      ? 'Retry mapping lookup'
      : overlayState === 'error'
        ? 'Retry adding to Sonarr'
        : quickAddTitle;

  const swallowEvent = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleQuickAdd = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      swallowEvent(event);

      if (!sonarrReady) {
        alert('Please configure your Sonarr settings first.');
        browser.runtime.openOptionsPage().catch(() => {});
        return;

      }



      if (overlayState === 'in-sonarr' || overlayState === 'resolving' || overlayState === 'adding') {

        return;

      }



      if (overlayState === 'error') {
        if (mappingUnavailable) {
          bypassFailureCacheRef.current = true;
          refetch({ throwOnError: false })
            .catch(() => {})
            .finally(() => {
              bypassFailureCacheRef.current = false;
            });
          return;
        }

        if (addHasError && defaultForm) {
          reset();
          mutate({
            anilistId,
            title,
            primaryTitleHint: title,
            form: { ...defaultForm },
          });
          return;
        }

        if (statusHasError) {
          bypassFailureCacheRef.current = true;
          refetch({ throwOnError: false })
            .catch(() => {})
            .finally(() => {
              bypassFailureCacheRef.current = false;
            });
          return;
        }
      }

      if (!defaultForm) {
        return;
      }

      mutate({
        anilistId,
        title,
        primaryTitleHint: title,
        form: { ...defaultForm },
      });
    },
    [
      addHasError,
      anilistId,
      defaultForm,
      mappingUnavailable,
      mutate,
      overlayState,
      refetch,
      reset,
      sonarrReady,
      statusHasError,
      swallowEvent,
      title,
    ],
  );

  const handleOpenAdvanced = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      swallowEvent(event);
      if (overlayState === 'resolving' || overlayState === 'adding') return;
      onOpenModal(anilistId, title);
    },
    [anilistId, onOpenModal, overlayState, swallowEvent, title],
  );

  const quickAddIcon = (() => {
    switch (overlayState) {
      case 'resolving':
      case 'adding':
        return <span className="kitsunarr-card-overlay__spinner" aria-hidden="true" />;
      case 'in-sonarr':
        return <CheckIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      case 'error':
        return <ExclamationTriangleIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      default:
        return <PlusIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
    }
  })();

  const quickAddTooltip = quickAddTitle;
  const tooltipContainer = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);

  const showAdvancedButton = overlayState === 'addable';
  const advancedDisabled = false;

  return (
    <div className="kitsunarr-card-overlay" data-state={overlayState}>
      <TooltipWrapper
        content={quickAddTooltip}
        side="top"
        align="start"
        sideOffset={6}
        container={tooltipContainer}
      >
        <button
          type="button"
          className="kitsunarr-card-overlay__quick"
          data-state={overlayState}
          aria-label={quickAddAriaLabel}
          onClick={handleQuickAdd}
          onMouseDown={swallowEvent}
          disabled={quickAddDisabled}
          aria-disabled={quickAddDisabled || undefined}
        >
          {quickAddIcon}
        </button>
      </TooltipWrapper>

      {showAdvancedButton && (
        <div className="kitsunarr-card-overlay__gear-shell" data-state={overlayState}>
          <TooltipWrapper
            content="Advanced Sonarr options"
            side="top"
            align="start"
            sideOffset={6}
            container={tooltipContainer}
          >
            <button
              type="button"
              className="kitsunarr-card-overlay__gear"
              aria-label="Open advanced Sonarr options"
              onClick={handleOpenAdvanced}
              onMouseDown={swallowEvent}
              disabled={advancedDisabled}
              aria-disabled={advancedDisabled || undefined}
            >
              <GearIcon aria-hidden="true" />
            </button>
          </TooltipWrapper>
        </div>
      )}
    </div>
  );
});
CardOverlay.displayName = 'CardOverlay';

const toElementArray = (value: Iterable<Element> | Element | null | undefined): Element[] => {
  if (!value) return [];
  if (value instanceof Element) return [value];
  try {
    return Array.from(value).filter((el): el is Element => el instanceof Element);
  } catch {
    return [];
  }
};

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

    const { data: extensionOptions } = useExtensionOptions();
    const isConfigured = Boolean(extensionOptions?.sonarrUrl && extensionOptions?.sonarrApiKey);

    const [cardPortals, setCardPortals] = useState<Map<Element, ParsedCard>>(new Map());
    const [modalState, setModalState] = useState<ModalState | null>(null);

    const handleOpenModal = useCallback((anilistId: number, title: string) => {
      setModalState({ anilistId, title });
    }, []);

    const handleCloseModal = useCallback(() => setModalState(null), []);

    const removePortalForContainer = useCallback(
      (container: Element, removeDom = false) => {
        setCardPortals(prev => {
          if (!prev.has(container)) return prev;
          const next = new Map(prev);
          const parsed = next.get(container);
          if (parsed) {
            clearProcessedImpl(parsed.host);
          }
          next.delete(container);
          return next;
        });

        if (removeDom && container instanceof HTMLElement && container.isConnected) {
          container.remove();
        }
      },
      [],
    );

    const removeStalePortals = useCallback(() => {
      setCardPortals(prev => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Map(prev);
        for (const [container, parsed] of prev.entries()) {
          if (!document.contains(container)) {
            clearProcessedImpl(parsed.host);
            next.delete(container);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, []);

    const upsertCard = useCallback(
      (card: Element) => {
        const parsed = parseCard(card);
        if (!parsed) {
          adapter.onCardInvalid?.(card);
          const fallbackContainer = getContainerForCardImpl(card);
          if (fallbackContainer) {
            removePortalForContainer(fallbackContainer, true);
          }
          return;
        }

        const container = ensureContainerImpl(parsed.host, card);
        markProcessedImpl(parsed.host, parsed);

        setCardPortals(prev => {
          const existing = prev.get(container);
          if (
            existing &&
            existing.anilistId === parsed.anilistId &&
            existing.title === parsed.title &&
            existing.host === parsed.host
          ) {
            return prev;
          }
          const next = new Map(prev);
          next.set(container, parsed);
          return next;
        });
      },
      [removePortalForContainer],
    );

    const scanAll = useCallback(() => {
      const root = getScanRoot();
      if (!root) {
        removeStalePortals();
        return;
      }

      const cards = root.querySelectorAll(cardSelector);
      if (cards.length === 0) {
        removeStalePortals();
        return;
      }

      cards.forEach(card => upsertCard(card));
      removeStalePortals();
    }, [removeStalePortals, upsertCard]);

    useEffect(() => {
      const observerRoot = getObserverRoot();
      if (!observerRoot) return;

      scanAll();

      const mo = new MutationObserver(mutations => {
        let shouldRescan = false;
        const cardsToUpsert = new Set<Element>();

        const enqueueCardForNode = (node: Node | null | undefined) => {
          if (!node) return;
          const element = node instanceof Element ? node : node.parentElement;
          const card = element?.closest(cardSelector);
          if (card) cardsToUpsert.add(card);
        };

        for (const mutation of mutations) {
          mutation.addedNodes.forEach(node => {
            if (node instanceof Element && node.matches(cardSelector)) {
              cardsToUpsert.add(node);
              return;
            }

            enqueueCardForNode(node);

            if (!shouldRescan && (node instanceof Element || node instanceof DocumentFragment)) {
              if (node.querySelector?.(cardSelector)) {
                shouldRescan = true;
              }
            }
          });

          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            enqueueCardForNode(mutation.target);
          }

          if (mutation.type === 'attributes' && mutation.target instanceof Element) {
            enqueueCardForNode(mutation.target);
          }

          if (mutation.removedNodes.length > 0) {
            mutation.removedNodes.forEach(node => {
              if (node instanceof Element) {
                if (node.matches(cardSelector)) {
                  adapter.onCardInvalid?.(node);
                }
                node.querySelectorAll(containerSelector).forEach(container => {
                  removePortalForContainer(container, false);
                });
              }
            });
            removeStalePortals();
          }
        }

        cardsToUpsert.forEach(card => upsertCard(card));

        if (shouldRescan) scanAll();
      });

      mo.observe(observerRoot, mutationObserverInit);

      const resizeTargets = toElementArray(getResizeTargets());
      let ro: ResizeObserver | null = null;
      if (resizeTargets.length > 0) {
        ro = new ResizeObserver(() => removeStalePortals());
        for (const target of resizeTargets) {
          try {
            ro.observe(target);
          } catch {
            // Ignore observation errors for nodes that might no longer be connected.
          }
        }
      }

      return () => {
        mo.disconnect();
        if (ro) {
          ro.disconnect();
        }
      };
    }, [
      removePortalForContainer,
      removeStalePortals,
      scanAll,
      upsertCard,
    ]);

    return (
      <div ref={hostRef}>
        {Array.from(cardPortals.entries()).map(([container, parsed]) =>
          createPortal(
            <CardOverlay
              anilistId={parsed.anilistId}
              title={parsed.title}
              onOpenModal={handleOpenModal}
              isConfigured={isConfigured}
              defaultForm={extensionOptions?.defaults ?? null}
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
            })}
        </React.Suspense>
      </div>
    );
  };

  return BrowseContentApp;
};

export { CardOverlay };


















