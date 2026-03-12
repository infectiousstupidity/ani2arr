import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, TriangleAlert, SlidersHorizontal, Plus, Wrench, SquareArrowOutUpRight, RotateCcw } from 'lucide-react';
import TooltipWrapper from '@/shared/ui/primitives/tooltip';
import type { CardOverlayProps, CheckMovieStatusResponse, CheckSeriesStatusResponse } from '@/shared/types';
import { getLibrarySlug, type FolderSlugSource } from '@/services/helpers/path-utils';
import { getProviderLabel } from '@/services/providers/resolver';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';
import { useCardOverlayState } from '../hooks/use-card-overlay-state';

const CardOverlay: React.FC<CardOverlayProps> = memo(({
  service,
  anilistId,
  title,
  onOpenModal,
  onOpenMappingFix,
  isConfigured,
  defaultForm,
  metadata,
  providerUrl,
  observeTarget,
  badgeVisibility = 'always',
  anchorCorner = 'bottom-left',
  stackDirection = 'up',
  anchorOffsetX = -8,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const gateTimerRef = useRef<number | null>(null);
  const [stackOpen, setStackOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const openStack = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setStackOpen(true);
  }, []);

  const scheduleCloseStack = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setStackOpen(false);
      closeTimerRef.current = null;
    }, 160);
  }, []);

  useEffect(() => {
    const target = (observeTarget as Element | undefined) ?? null;
    if (!target || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.target === target) {
              setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.25);
            }
          }
        },
        { root: null, threshold: 0.25 },
      );
    }
    const observer = observerRef.current;
    try { observer.observe(target); } catch { /* ignore */ }
    return () => { try { observer.unobserve(target); } catch { /* ignore */ } };
  }, [observeTarget]);

  // Micro-gate: wait briefly after becoming visible to allow batch prefetch
  useEffect(() => {
    if (!isVisible) {
      setGateOpen(false);
      if (gateTimerRef.current !== null) {
        window.clearTimeout(gateTimerRef.current);
        gateTimerRef.current = null;
      }
      return;
    }
    if (gateTimerRef.current !== null) {
      window.clearTimeout(gateTimerRef.current);
      gateTimerRef.current = null;
    }
    gateTimerRef.current = window.setTimeout(() => {
      setGateOpen(true);
      gateTimerRef.current = null;
    }, 125);
    return () => {
      if (gateTimerRef.current !== null) {
        window.clearTimeout(gateTimerRef.current);
        gateTimerRef.current = null;
      }
    };
  }, [isVisible]);
  const {
    overlayState,
    quickAddTitle,
    quickAddAriaLabel,
    quickAddDisabled,
    handleQuickAdd,
    statusData,
    mappingUnavailable,
  } = useCardOverlayState({
    service,
    anilistId,
    title,
    metadata,
    defaultForm,
    isConfigured,
    enabled: isVisible && gateOpen,
  });
  const providerLabel = getProviderLabel(service);

  const swallowEvent = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleOpenAdvanced = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      swallowEvent(event);
      if (overlayState === 'resolving' || overlayState === 'adding') return;
      onOpenModal(anilistId, title, metadata);
    },
    [anilistId, metadata, onOpenModal, overlayState, swallowEvent, title],
  );

  const quickAddIcon = (() => {
    switch (overlayState) {
      case 'resolving':
      case 'adding':
        return <RotateCcw className="a2a-card-overlay__symbol a2a-rotate" aria-hidden="true" />;
      case 'in-library':
        return <Check className="a2a-card-overlay__symbol" aria-hidden="true" />;
      case 'error':
        return <TriangleAlert className="a2a-card-overlay__symbol" aria-hidden="true" />;
      default:
        return <Plus className="a2a-card-overlay__symbol" aria-hidden="true" />;
    }
  })();

  const tooltipContainer = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);
  const showAdvancedButton = overlayState === 'addable' || overlayState === 'in-library' || overlayState === 'error' || overlayState === 'resolving' || overlayState === 'adding';
  const showExternalButton = (overlayState === 'in-library' || overlayState === 'adding') && Boolean(providerUrl);
  const advancedDisabled = overlayState === 'resolving' || overlayState === 'adding' || (overlayState === 'error' && mappingUnavailable);
  const seriesStatus = service === 'sonarr' ? (statusData as CheckSeriesStatusResponse | undefined) : undefined;
  const movieStatus = service === 'radarr' ? (statusData as CheckMovieStatusResponse | undefined) : undefined;
  const librarySlug = useMemo(() => {
    if (service === 'radarr') {
      return getLibrarySlug('radarr', (movieStatus?.movie ?? null) as FolderSlugSource | null);
    }
    return getLibrarySlug('sonarr', (seriesStatus?.series ?? null) as FolderSlugSource | null);
  }, [movieStatus?.movie, seriesStatus?.series, service]);
  const externalHref = useMemo(() => {
    return buildExternalMediaLink({
      service,
      baseUrl: providerUrl ?? '',
      inLibrary: overlayState === 'in-library' && Boolean(librarySlug),
      ...(librarySlug ? { librarySlug } : {}),
      searchTerm: title,
    });
  }, [librarySlug, overlayState, providerUrl, service, title]);

  const overrideActive = (service === 'radarr' ? movieStatus?.overrideActive : seriesStatus?.overrideActive) === true;

  const openMappingFix = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenMappingFix?.(anilistId, title, overrideActive);
  }, [anilistId, onOpenMappingFix, overrideActive, title]);

  

  // Prebuild stack action nodes
  const actionOpenExternal = (
    showExternalButton && externalHref ? (
      <TooltipWrapper content={`Open in ${providerLabel}`} side="right" align="center" sideOffset={6} container={tooltipContainer} showArrow={false}>
        <button
          type="button"
          className="a2a-card-overlay__action a2a-card-overlay__action--external"
          aria-label={`Open in ${providerLabel}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try { window.open(externalHref || undefined, '_blank', 'noopener'); } catch { /* ignore */ }
          }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <SquareArrowOutUpRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </TooltipWrapper>
    ) : null
  );

  const actionFixMapping = (
    onOpenMappingFix ? (
      <TooltipWrapper content="Fix mapping…" side="right" align="center" sideOffset={6} container={tooltipContainer} showArrow={false}>
        <button type="button" className="a2a-card-overlay__action a2a-card-overlay__action--fix" aria-label="Fix mapping" onClick={openMappingFix} onMouseDown={swallowEvent}>
          <Wrench aria-hidden="true" className="h-4 w-4" />
        </button>
      </TooltipWrapper>
    ) : null
  );

  const actionAdvanced = (
    showAdvancedButton ? (
      <TooltipWrapper content={`${providerLabel} options`} side="right" align="center" sideOffset={6} container={tooltipContainer} showArrow={false}>
        <button
          type="button"
          className="a2a-card-overlay__action a2a-card-overlay__action--advanced"
          aria-label={`Open ${providerLabel} options`}
          onClick={handleOpenAdvanced}
          onMouseDown={swallowEvent}
          disabled={advancedDisabled}
          aria-disabled={advancedDisabled || undefined}
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        </button>
      </TooltipWrapper>
    ) : null
  );

  const renderStackItems = () => {
    const items: React.ReactElement[] = [];
    const showExternal = (overlayState === 'in-library' || overlayState === 'adding') && !!actionOpenExternal;
    if (stackDirection === 'down') {
      if (actionAdvanced) items.push(<span key="advanced">{actionAdvanced}</span>);
      if (actionFixMapping) items.push(<span key="fix">{actionFixMapping}</span>);
      if (showExternal) items.push(<span key="external">{actionOpenExternal}</span>);
    } else {
      // Stack grows upward: the last DOM item sits closest to the anchor.
      // Desired visual bottom→top = Advanced → Fix mapping → Open in provider.
      // Therefore DOM (top→bottom) must be = Open → Fix mapping → Advanced.
      if (showExternal) items.push(<span key="external">{actionOpenExternal}</span>);
      if (actionFixMapping) items.push(<span key="fix">{actionFixMapping}</span>);
      if (actionAdvanced) items.push(<span key="advanced">{actionAdvanced}</span>);
    }
    return items;
  };

  return (
    <div
      className="a2a-card-overlay"
      data-state={overlayState}
      data-corner={anchorCorner}
      data-visibility={badgeVisibility}
      style={{ ['--badge-offset-x']: `${anchorOffsetX}px` } as React.CSSProperties}
      onMouseEnter={openStack}
      onMouseLeave={scheduleCloseStack}
    >
      <div className="a2a-card-overlay__anchor-wrap" onMouseEnter={openStack} onMouseLeave={scheduleCloseStack}>
        <TooltipWrapper
          content={quickAddTitle}
          side="right"
          align="center"
          sideOffset={6}
          container={tooltipContainer}
          showArrow={false}
        >
          <button
            type="button"
            className="a2a-card-overlay__quick"
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
      </div>

      {/* Vertical action stack */}
      {(showAdvancedButton || showExternalButton || onOpenMappingFix) && (
        <div
          className="a2a-card-overlay__stack"
          data-open={stackOpen || undefined}
          data-direction={stackDirection}
          onMouseEnter={openStack}
          onMouseLeave={scheduleCloseStack}
        >
          {renderStackItems()}

        </div>
      )}
    </div>
  );
});

CardOverlay.displayName = 'CardOverlay';

export { CardOverlay };

// (removed) Wrench fallback not needed after switching to lucide-react
