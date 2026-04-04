/** Anime-page action group for provider quick add, deep links, and manual mapping entry points. */
// src/entrypoints/anilist-anime.content/components/media-actions.tsx
import React from 'react';
import Button from '@/shared/ui/primitives/button';
import { SquareArrowOutUpRight, ChevronDown } from 'lucide-react';
import { logger } from '@/shared/utils/logger';
import Dropdown, { DropdownItem } from '@/shared/ui/primitives/dropdown';
import { buildExternalMediaLink } from '@/shared/utils/provider-links';
import type { Provider } from '@/integrations/providers';
import { getProviderBaseUrl, getProviderLabel, isProviderConfigured } from '@/services/providers/resolver';
import { usePublicOptions } from '@/options';

export type Status = 'LOADING' | 'IN' | 'NOT_IN' | 'ERROR' | 'ADDING';

interface MediaActionsProps {
  provider: Provider;
  status: Status;
  librarySlug?: string;
  resolvedSearchTerm: string;
  externalId: number | null | undefined;
  noAutoMatch?: boolean;
  onQuickAdd: () => void;
  onOpenModal: () => void;
  onOpenMappingFix: (mappingRequired?: boolean) => void;
  portalContainer?: HTMLElement | undefined;
}

const log = logger.create('MediaActions');

const MediaActions: React.FC<MediaActionsProps> = ({
  provider,
  status,
  librarySlug,
  resolvedSearchTerm,
  externalId,
  noAutoMatch = false,
  onQuickAdd,
  onOpenModal,
  onOpenMappingFix,
  portalContainer,
}) => {
  const { data: options } = usePublicOptions();

  const serviceLabel = getProviderLabel(provider);
  const inService = status === 'IN';
  const isLoading = status === 'LOADING' || status === 'ADDING';
  const getButtonText = () => {
    switch (status) {
      case 'LOADING': {
        return `Checking ${serviceLabel}...`;
      }
      case 'IN': {
        return `In ${serviceLabel}`;
      }
      case 'ADDING': {
        return 'Adding...';
      }
      case 'ERROR': {
        return 'Error';
      }
      default: {
        return `Add to ${serviceLabel}`;
      }
    }
  };
  const isServiceConfigured = isProviderConfigured(provider, options);
  const requiresConfiguration = !isServiceConfigured;
  const shouldOpenManualMatch = noAutoMatch && !inService && !requiresConfiguration;
  const hasMapping = externalId != null;
  const manualMappingLabel = hasMapping ? 'Update mapping manually' : 'Find match manually';
  const mainButtonText = requiresConfiguration
    ? `Configure ${serviceLabel}`
    : (shouldOpenManualMatch
      ? 'Find match'
      : getButtonText());
  const disableMainAction = isLoading;
  let handleMainAction = onQuickAdd;
  if (requiresConfiguration) {
    handleMainAction = onQuickAdd;
  } else if (shouldOpenManualMatch) {
    handleMainAction = () => onOpenMappingFix(true);
  } else if (inService) {
    handleMainAction = onOpenModal;
  }

  const externalBaseUrl = getProviderBaseUrl(provider, options);
  const hasExternal = externalBaseUrl.length > 0;

  let mainButtonTooltip: string | undefined;
  if (requiresConfiguration) {
    mainButtonTooltip = `Open ${serviceLabel} settings to continue.`;
  } else if (shouldOpenManualMatch) {
    mainButtonTooltip = `No automatic ${serviceLabel} match was found. Search manually.`;
  } else {
    switch (status) {
      case 'IN': {
        mainButtonTooltip = `Open ${serviceLabel} options`;
        break;
      }
      case 'LOADING': {
        mainButtonTooltip = `Checking ${serviceLabel} status...`;
        break;
      }
      case 'ADDING': {
        mainButtonTooltip = `Submitting add request to ${serviceLabel}...`;
        break;
      }
      case 'ERROR': {
        mainButtonTooltip = 'An error occurred resolving this title.';
        break;
      }
      default: {
        break;
      }
    }
  }

  const linkInput: Parameters<typeof buildExternalMediaLink>[0] = {
    provider,
    baseUrl: externalBaseUrl.replace(/\/$/, ''),
    inLibrary: inService && Boolean(librarySlug),
    ...(librarySlug ? { librarySlug } : {}),
    ...(resolvedSearchTerm ? { searchTerm: resolvedSearchTerm } : {}),
  };
  const externalHref = hasExternal ? buildExternalMediaLink(linkInput) : null;

  const Group: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="relative flex items-stretch rounded-[3px] overflow-hidden" role="group" style={{ width: '100%' }}>
      {children}
    </div>
  );

  return (
    <div className={`grid ${externalHref ? 'grid-cols-[1fr_auto] gap-3.75' : 'grid-cols-1 gap-0'} items-start w-full`}>
      <Group>
        <Button
          data-testid="a2a-main-action-button"
          size="md"
          onClick={handleMainAction}
          isLoading={isLoading}
          disabled={disableMainAction}
          {...(mainButtonTooltip ? { tooltip: mainButtonTooltip } : {})}
          portalContainer={portalContainer}
          className="flex-1 w-[calc(100%-34px)] rounded-none h-8.75 text-[14px] text-center px-0 pl-2.5"
          loadingText={getButtonText()}
        >
          {mainButtonText}
        </Button>

        <Dropdown
          container={portalContainer ?? null}
          trigger={
            <Button
              data-testid="a2a-actions-dropdown"
              size="icon"
              variant="primary"
              portalContainer={portalContainer}
              className="relative rounded-none h-8.75 w-8.5 after:content-[''] after:absolute after:inset-0 after:bg-[rgba(255,255,255,0.14)] after:pointer-events-none"
              aria-label="Actions"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          }
        >
          <DropdownItem onSelect={onOpenModal} disabled={externalId === null}>
            {serviceLabel} options
          </DropdownItem>
          <DropdownItem onSelect={() => { log.debug('Action: Fix mapping clicked'); onOpenMappingFix(!hasMapping); }} disabled={!isServiceConfigured}>
            {manualMappingLabel}
          </DropdownItem>
        </Dropdown>
      </Group>

      {externalHref && (
        <Button
          asChild
          size="icon"
          variant="primary"
          tooltip={`Open in ${serviceLabel}`}
          portalContainer={portalContainer}
          className="h-8.75 w-8.75 rounded-[3px]"
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
