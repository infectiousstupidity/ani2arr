// Version date: 2025-11-12
import React from 'react';
import Button from '@/shared/components/button';
import TooltipWrapper from '@/shared/components/tooltip';
import { SquareArrowOutUpRight, ChevronDown } from 'lucide-react';
import { usePublicOptions } from '@/shared/hooks/use-api-queries';
import { logger } from '@/shared/utils/logger';
import Dropdown, { DropdownItem } from '@/shared/components/dropdown';
import { buildExternalMediaLink, type ExternalLinkInput } from '@/shared/utils/build-external-media-link';
import type { MediaService } from '@/shared/types';

export type Status = 'LOADING' | 'IN' | 'NOT_IN' | 'ERROR' | 'ADDING';

interface MediaActionsProps {
  service: MediaService;      // 'sonarr' | 'radarr'
  status: Status;
  librarySlug?: string;       // optional - do not pass when undefined
  resolvedSearchTerm: string;
  externalId: number | null | undefined;
  onQuickAdd: () => void;
  onOpenModal: () => void;
  onOpenMappingFix: () => void;
  portalContainer?: HTMLElement | undefined;
}

const log = logger.create('MediaActions');

const MediaActions: React.FC<MediaActionsProps> = ({
  service,
  status,
  librarySlug,
  resolvedSearchTerm,
  externalId,
  onQuickAdd,
  onOpenModal,
  onOpenMappingFix,
  portalContainer
}) => {
  const { data: options } = usePublicOptions();

  const serviceLabel = service === 'sonarr' ? 'Sonarr' : 'Radarr';
  const inService = status === 'IN';
  const isLoading = status === 'LOADING' || status === 'ADDING';

  const sonarrUrl = (options as { sonarrUrl?: string } | undefined)?.sonarrUrl ?? '';
  const radarrUrl = (options as { radarrUrl?: string } | undefined)?.radarrUrl ?? '';
  const externalBaseUrl = service === 'sonarr' ? sonarrUrl : radarrUrl;
  const hasExternal = externalBaseUrl.length > 0;

  const groupTooltip =
    externalId === null
      ? 'No automatic ID match was found for this title. Try searching for it manually.'
      : undefined;

  const getButtonText = () => {
    switch (status) {
      case 'LOADING': return `Checking ${serviceLabel}...`;
      case 'IN': return `In ${serviceLabel}`;
      case 'ADDING': return 'Adding...';
      case 'ERROR': return 'Error';
      default: return `Add to ${serviceLabel}`;
    }
  };

  const mainButtonTooltip =
    groupTooltip
      ? undefined
      : status === 'IN'
        ? `Open ${serviceLabel} options`
        : status === 'LOADING'
          ? `Checking ${serviceLabel} status...`
          : status === 'ADDING'
            ? `Submitting add request to ${serviceLabel}...`
            : status === 'ERROR'
              ? 'An error occurred resolving this title.'
              : undefined;

  const linkInput: ExternalLinkInput = {
    service,
    baseUrl: externalBaseUrl.replace(/\/$/, ''),
    inLibrary: inService && Boolean(librarySlug),
    ...(librarySlug ? { librarySlug } : {}),
    ...(resolvedSearchTerm ? { searchTerm: resolvedSearchTerm } : {}),
  };
  const externalHref = hasExternal ? buildExternalMediaLink(linkInput) : '';

  const Group: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="relative flex items-stretch rounded-[3px] overflow-hidden" role="group" style={{ width: '100%' }}>
      {children}
    </div>
  );

  return (
    <div className={`grid ${hasExternal ? 'grid-cols-[1fr_auto] gap-[15px]' : 'grid-cols-1 gap-0'} items-start w-full`}>
      {groupTooltip ? (
        <TooltipWrapper content={groupTooltip} container={portalContainer ?? null}>
          <Group>
            <Button
              data-testid="a2a-main-action-button"
              size="md"
              onClick={inService ? onOpenModal : onQuickAdd}
              isLoading={isLoading}
              disabled={isLoading || (externalId === null && !inService)}
              portalContainer={portalContainer}
              className="flex-1 w-[calc(100%-34px)] rounded-none h-[35px] text-[14px] text-center px-0 pl-2.5"
              loadingText={getButtonText()}
            >
              {externalId === null ? 'Cannot add' : getButtonText()}
            </Button>

            <Dropdown
              container={portalContainer ?? null}
              trigger={
                <Button
                  data-testid="a2a-actions-dropdown"
                  size="icon"
                  variant="primary"
                  portalContainer={portalContainer}
                  className="relative rounded-none h-[35px] w-[34px]"
                  aria-label="Actions"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }
            >
              <DropdownItem onSelect={onOpenModal} disabled={externalId === null}>
                {serviceLabel} options
              </DropdownItem>
              <DropdownItem onSelect={() => { log.debug('Action: Fix mapping clicked'); onOpenMappingFix(); }}>
                Fix mapping…
              </DropdownItem>
            </Dropdown>
          </Group>
        </TooltipWrapper>
      ) : (
        <Group>
          <Button
            data-testid="a2a-main-action-button"
            size="md"
            onClick={inService ? onOpenModal : onQuickAdd}
            isLoading={isLoading}
            disabled={isLoading || (externalId === null && !inService)}
            {...(mainButtonTooltip ? { tooltip: mainButtonTooltip } : {})}
            portalContainer={portalContainer}
            className="flex-1 w-[calc(100%-34px)] rounded-none h-[35px] text-[14px] text-center px-0 pl-2.5"
            loadingText={getButtonText()}
          >
            {externalId === null ? 'Cannot add' : getButtonText()}
          </Button>

          <Dropdown
            container={portalContainer ?? null}
            trigger={
              <Button
                data-testid="a2a-actions-dropdown"
                size="icon"
                variant="primary"
                portalContainer={portalContainer}
                className="relative rounded-none h-[35px] w-[34px] after:content-[''] after:absolute after:inset-0 after:bg-[rgba(255,255,255,0.14)] after:pointer-events-none"
                aria-label="Actions"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            }
          >
            <DropdownItem onSelect={onOpenModal} disabled={externalId === null}>
              {serviceLabel} options
            </DropdownItem>
            <DropdownItem onSelect={() => { log.debug('Action: Fix mapping clicked'); onOpenMappingFix(); }}>
              Fix mapping…
            </DropdownItem>
          </Dropdown>
        </Group>
      )}

      {hasExternal && (
        <Button
          asChild
          size="icon"
          variant="primary"
          tooltip={`Open in ${serviceLabel}`}
          portalContainer={portalContainer}
          className="h-[35px] w-[35px] rounded-[3px]"
          onClick={() => {
            if (inService && librarySlug) {
              log.debug(`Redirecting to ${serviceLabel} library page for slug: ${librarySlug}`);
            } else {
              log.debug(`Redirecting to ${serviceLabel} Add with term: ${resolvedSearchTerm}`);
            }
          }}
        >
          <a href={externalHref} target="_blank" rel="noopener noreferrer">
            <SquareArrowOutUpRight className="h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  );
};

export default MediaActions;
