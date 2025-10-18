import React, { memo, useCallback, useMemo } from 'react';
import { CheckIcon, ExclamationTriangleIcon, ExternalLinkIcon, GearIcon, PlusIcon } from '@radix-ui/react-icons';
import TooltipWrapper from '@/ui/TooltipWrapper';
import type { CardOverlayProps } from '@/ui/browse-overlay-types';
import { useCardOverlayState } from '@/hooks/use-card-overlay-state';

const CardOverlay: React.FC<CardOverlayProps> = memo(({
  anilistId,
  title,
  onOpenModal,
  isConfigured,
  defaultForm,
  metadata,
  sonarrUrl,
}) => {
  const {
    overlayState,
    quickAddTitle,
    quickAddAriaLabel,
    quickAddDisabled,
    handleQuickAdd,
    statusData,
  } = useCardOverlayState({
    anilistId,
    title,
    metadata,
    defaultForm,
    isConfigured,
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
        return <span className="kitsunarr-card-overlay__spinner" aria-hidden="true" />;
      case 'in-sonarr':
        return <CheckIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      case 'error':
        return <ExclamationTriangleIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
      default:
        return <PlusIcon className="kitsunarr-card-overlay__symbol" aria-hidden="true" />;
    }
  })();

  const tooltipContainer = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);
  const showAdvancedButton = overlayState === 'addable';
  const showExternalButton = overlayState === 'in-sonarr' && Boolean(sonarrUrl);
  const advancedDisabled = false;
  const externalHref = useMemo(() => {
    if (!sonarrUrl) return null;
    const normalized = sonarrUrl.replace(/\/$/, '');
    if (statusData?.series?.titleSlug) {
      return `${normalized}/series/${statusData.series.titleSlug}`;
    }
    return `${normalized}/add/new?term=${encodeURIComponent(title)}`;
  }, [sonarrUrl, statusData?.series?.titleSlug, title]);

  return (
    <div className="kitsunarr-card-overlay" data-state={overlayState}>
      <TooltipWrapper
        content={quickAddTitle}
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

      {(showAdvancedButton || showExternalButton) && (
        <div className="kitsunarr-card-overlay__gear-shell" data-state={overlayState}>
          {showAdvancedButton && (
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
          )}

          {showExternalButton && externalHref && (
            <TooltipWrapper
              content="Open in Sonarr"
              side="top"
              align="start"
              sideOffset={6}
              container={tooltipContainer}
            >
              <div>
                {/* mirror External Link Button behavior from SonarrActionGroup */}
                <a
                  className="kitsunarr-card-overlay__external"
                  href={externalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseDown={swallowEvent}
                  aria-label="Open in Sonarr"
                >
                  <ExternalLinkIcon aria-hidden="true" />
                </a>
              </div>
            </TooltipWrapper>
          )}
        </div>
      )}
    </div>
  );
});

CardOverlay.displayName = 'CardOverlay';

export { CardOverlay };
