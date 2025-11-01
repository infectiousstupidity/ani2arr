// src/ui/SonarrActionGroup.tsx
import React from 'react';
import Button from '@/ui/Button';
import TooltipWrapper from '@/ui/TooltipWrapper';
import { SquareArrowOutUpRight, ChevronDown } from 'lucide-react';
import { usePublicOptions } from '@/hooks/use-api-queries';
import { logger } from '@/utils/logger';
import Dropdown, { DropdownItem } from '@/ui/Dropdown';

type Status = 'LOADING' | 'IN_SONARR' | 'NOT_IN_SONARR' | 'ERROR' | 'ADDING';

interface SonarrActionGroupProps {
  status: Status;
  seriesTitleSlug?: string | undefined;
  animeTitle: string;
  resolvedSearchTerm: string;
  tvdbId: number | null | undefined;
  onQuickAdd: () => void;
  onOpenModal: () => void; // Advanced Sonarr options
  onOpenMappingFix: () => void; // Fix mapping modal
  portalContainer?: HTMLElement | undefined;
}

const log = logger.create('SonarrActionGroup');
const SonarrActionGroup: React.FC<SonarrActionGroupProps> = ({
  status,
  seriesTitleSlug,
  resolvedSearchTerm,
  tvdbId,
  onQuickAdd,
  onOpenModal,
  onOpenMappingFix,
  portalContainer
}) => {
  const { data: options } = usePublicOptions();

  const getButtonText = () => {
    switch (status) {
      case 'LOADING': return 'Checking Sonarr...';
      case 'IN_SONARR': return 'In Sonarr';
      case 'ADDING': return 'Adding...';
      case 'ERROR': return 'Error';
      default: return 'Add to Sonarr';
    }
  };

  const isIdle = status === 'NOT_IN_SONARR';
  const isInSonarr = status === 'IN_SONARR';
  const isLoading = status === 'LOADING' || status === 'ADDING';

  // Group-level tooltip: when mapping wasn't found, show the same message for the whole button cluster
  const groupTooltip = tvdbId === null ? 'No automatic TVDB ID match was found for this title. Try searching for it manually.' : undefined;

  const mainButtonTooltip = (() => {
    // When group tooltip is active, avoid a second tooltip on the button itself
    if (groupTooltip) return undefined;
    switch (status) {
      case 'IN_SONARR':
        return 'Already added to Sonarr';
      case 'LOADING':
        return 'Checking Sonarr status…';
      case 'ADDING':
        return 'Submitting add request to Sonarr…';
      case 'ERROR':
        return 'An error occurred resolving this title.';
      default:
        return undefined;
    }
  })();
  // Chevron should always be available to open actions (even when already in Sonarr or error states)
  const dropdownDisabled = false;
  
  return (
  <div className="grid grid-cols-[1fr_auto] gap-4 items-start w-full">
    {groupTooltip ? (
      <TooltipWrapper content={groupTooltip} container={portalContainer ?? null}>
      <div className="relative flex items-stretch rounded-[3px] overflow-hidden" role="group">
        {/* Main Action Button */}
        <Button
          data-testid="kitsunarr-main-action-button"
          size="md"
          onClick={onQuickAdd}
          isLoading={isLoading}
          disabled={!isIdle || tvdbId === null}
          portalContainer={portalContainer}
          className="flex-1 rounded-none h-[35px] text-[14px]"
          loadingText={getButtonText()}
        >
          {tvdbId === null ? "Cannot add" : getButtonText()}
        </Button>
        {/* Actions Dropdown */}
        <Dropdown
          container={portalContainer ?? null}
          trigger={
            <Button
              data-testid="kitsunarr-actions-dropdown"
              size="icon"
              variant="primary"
              disabled={dropdownDisabled}
              portalContainer={portalContainer}
              className="rounded-none h-[35px] w-[35px] focus-visible:z-10 focus-visible:ring-offset-0"
              aria-label="Actions"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          }
        >
          <DropdownItem onSelect={onOpenModal} disabled={tvdbId === null}>Advanced Sonarr options</DropdownItem>
          <DropdownItem onSelect={() => {
            log.debug('Action: Fix mapping clicked');
            onOpenMappingFix();
          }}>Fix mapping…</DropdownItem>
        </Dropdown>
      </div>
      </TooltipWrapper>
    ) : (
      <div className="relative flex items-stretch rounded-[3px] overflow-hidden" role="group">
            {/* Main Action Button */}
      <Button
        data-testid="kitsunarr-main-action-button"
        size="md"
        onClick={onQuickAdd}
        isLoading={isLoading}
        disabled={!isIdle || tvdbId === null}
        {...(mainButtonTooltip ? { tooltip: mainButtonTooltip } : {})}
        portalContainer={portalContainer}
        className="flex-1 rounded-none h-[35px] text-[14px]"
        loadingText={getButtonText()}
      >
                {tvdbId === null ? "Cannot add" : getButtonText()}
            </Button>
            {/* Actions Dropdown */}
            <Dropdown
              container={portalContainer ?? null}
              trigger={
                <Button
                  data-testid="kitsunarr-actions-dropdown"
                  size="icon"
                  variant="primary"
                  disabled={dropdownDisabled}
                  portalContainer={portalContainer}
                  className="rounded-none h-[35px] w-[35px] focus-visible:z-10 focus-visible:ring-offset-0"
                  aria-label="Actions"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }
            >
              <DropdownItem onSelect={onOpenModal} disabled={tvdbId === null}>Advanced Sonarr options</DropdownItem>
              <DropdownItem onSelect={() => {
                log.debug('Action: Fix mapping clicked');
                onOpenMappingFix();
              }}>Fix mapping…</DropdownItem>
            </Dropdown>
      </div>
    )}

        {/* External Link Button */}
        {options?.sonarrUrl && (
          <Button
            asChild
            size="icon"
            variant="primary"
            tooltip="Open in Sonarr"
            portalContainer={portalContainer}
            className="h-[35px] w-[35px] rounded-[3px]"
            onClick={() => {
              if (isInSonarr && seriesTitleSlug) {
                log.debug(`Redirecting to Sonarr series page for slug: ${seriesTitleSlug}`);
              } else {
                log.debug(`Redirecting to Sonarr Add New page with term: ${resolvedSearchTerm}`);
              }
            }}
          >
            <a
              href={
                isInSonarr && seriesTitleSlug
                  ? `${options.sonarrUrl.replace(/\/$/, '')}/series/${seriesTitleSlug}`
                  : `${options.sonarrUrl.replace(/\/$/, '')}/add/new?term=${encodeURIComponent(resolvedSearchTerm)}`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <SquareArrowOutUpRight className="h-4 w-4" />
            </a>
          </Button>
        )}
    </div>
  );
};

export default SonarrActionGroup;
