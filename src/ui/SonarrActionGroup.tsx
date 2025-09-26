// src/ui/SonarrActionGroup.tsx
import React from 'react';
import Button from '@/ui/Button';
import { GearIcon, ExternalLinkIcon } from '@radix-ui/react-icons';
import { useExtensionOptions } from '@/hooks/use-api-queries';
import { logger } from '@/utils/logger';

type Status = 'LOADING' | 'IN_SONARR' | 'NOT_IN_SONARR' | 'ERROR' | 'ADDING';

interface SonarrActionGroupProps {
  status: Status;
  seriesTitleSlug?: string | undefined;
  animeTitle: string;
  resolvedSearchTerm: string;
  tvdbId: number | null | undefined;
  onQuickAdd: () => void;
  onOpenModal: () => void;
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
  portalContainer
}) => {
  const { data: options } = useExtensionOptions();

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
  
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 items-start w-full">
        <div className="relative flex items-stretch rounded-[3px] overflow-hidden" role="group">
            {/* Main Action Button */}
            <Button
                size="md"
                onClick={onQuickAdd}
                isLoading={isLoading}
                disabled={!isIdle || tvdbId === null}
                className="flex-1 rounded-none h-[35px] text-[14px] text-text-primary"
                loadingText={getButtonText()}
            >
                {tvdbId === null ? "Cannot add" : getButtonText()}
            </Button>
            {/* Settings Button */}
            <Button
                size="icon"
                onClick={onOpenModal}
                disabled={!isIdle || tvdbId === null}
                tooltip="Advanced Sonarr options"
                portalContainer={portalContainer}
                className="rounded-none h-[35px] w-[35px] bg-[#3db4f2] text-[#072033] transition-colors hover:bg-[#299dd1] focus-visible:z-10 focus-visible:ring-offset-0 disabled:bg-[#3db4f2]/50 disabled:text-[#072033]/60"
                aria-label="Advanced options"
            >
                <GearIcon className="h-4 w-4 text-text-primary" />
            </Button>
        </div>

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
              <ExternalLinkIcon />
            </a>
          </Button>
        )}
    </div>
  );
};

export default SonarrActionGroup;