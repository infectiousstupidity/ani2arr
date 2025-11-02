import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, TriangleAlert, SlidersHorizontal, Plus, Wrench, SquareArrowOutUpRight, RotateCcw } from 'lucide-react';
import TooltipWrapper from '@/ui/TooltipWrapper';
import type { CardOverlayProps } from '@/types';
import { useCardOverlayState } from '@/hooks/use-card-overlay-state';

const CardOverlay: React.FC<CardOverlayProps> = memo(({
  anilistId,
  title,
  onOpenModal,
  onOpenMappingFix,
  isConfigured,
  defaultForm,
  metadata,
  sonarrUrl,
  observeTarget,
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
    anilistId,
    title,
    metadata,
    defaultForm,
    isConfigured,
    enabled: isVisible && gateOpen,
  });

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
        return <RotateCcw className="kitsunarr-card-overlay__symbol kitsunarr-rotate" aria-hidden="true" />;
      case 'in-sonarr':
        return <Check className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      case 'error':
        return <TriangleAlert className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      default:
        return <Plus className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
    }
  })();

  const tooltipContainer = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);
  const showAdvancedButton = overlayState === 'addable' || overlayState === 'in-sonarr' || overlayState === 'error' || overlayState === 'resolving' || overlayState === 'adding';
  const showExternalButton = (overlayState === 'in-sonarr' || overlayState === 'adding') && Boolean(sonarrUrl);
  const advancedDisabled = overlayState === 'resolving' || overlayState === 'adding' || (overlayState === 'error' && mappingUnavailable);
  const externalHref = useMemo(() => {
    if (!sonarrUrl) return null;
    const normalized = sonarrUrl.replace(/\/$/, '');
    if (statusData?.series?.titleSlug) {
      return `${normalized}/series/${statusData.series.titleSlug}`;
    }
    return `${normalized}/add/new?term=${encodeURIComponent(title)}`;
  }, [sonarrUrl, statusData?.series?.titleSlug, title]);

  const overrideActive = statusData?.overrideActive === true;

  const openMappingFix = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenMappingFix?.(anilistId, title, overrideActive);
  }, [anilistId, onOpenMappingFix, overrideActive, title]);

  

  // Prebuild stack action nodes
  const actionOpenExternal = (
    showExternalButton && externalHref ? (
      <TooltipWrapper content="Open in Sonarr" side="right" align="center" sideOffset={6} container={tooltipContainer} showArrow={false}>
        <button
          type="button"
          className="kitsunarr-card-overlay__action kitsunarr-card-overlay__action--external"
          aria-label="Open in Sonarr"
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
        <button type="button" className="kitsunarr-card-overlay__action kitsunarr-card-overlay__action--fix" aria-label="Fix mapping" onClick={openMappingFix} onMouseDown={swallowEvent}>
          <Wrench aria-hidden="true" className="h-4 w-4" />
        </button>
      </TooltipWrapper>
    ) : null
  );

  const actionAdvanced = (
    showAdvancedButton ? (
      <TooltipWrapper content="Advanced Sonarr options" side="right" align="center" sideOffset={6} container={tooltipContainer} showArrow={false}>
        <button
          type="button"
          className="kitsunarr-card-overlay__action kitsunarr-card-overlay__action--advanced"
          aria-label="Open advanced Sonarr options"
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
    const items: React.ReactNode[] = [];
    const showExternal = (overlayState === 'in-sonarr' || overlayState === 'adding') && !!actionOpenExternal;
    if (stackDirection === 'down') {
      if (actionAdvanced) items.push(actionAdvanced);
      if (actionFixMapping) items.push(actionFixMapping);
      if (showExternal) items.push(actionOpenExternal);
    } else {
      // Stack grows upward: the last DOM item sits closest to the anchor.
      // Desired visual bottom→top = Advanced → Fix mapping → Open in Sonarr.
      // Therefore DOM (top→bottom) must be = Open → Fix mapping → Advanced.
      if (showExternal) items.push(actionOpenExternal);
      if (actionFixMapping) items.push(actionFixMapping);
      if (actionAdvanced) items.push(actionAdvanced);
    }
    return items;
  };

  return (
    <div
      className="kitsunarr-card-overlay"
      data-state={overlayState}
      data-corner={anchorCorner}
      style={{ ['--badge-offset-x']: `${anchorOffsetX}px` } as React.CSSProperties}
      onMouseEnter={openStack}
      onMouseLeave={scheduleCloseStack}
    >
      <div className="kitsunarr-card-overlay__anchor-wrap" onMouseEnter={openStack} onMouseLeave={scheduleCloseStack}>
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
      </div>

      {/* Vertical action stack */}
      {(showAdvancedButton || showExternalButton || onOpenMappingFix) && (
        <div
          className="kitsunarr-card-overlay__stack"
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
