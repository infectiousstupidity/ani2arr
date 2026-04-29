/** Anime-page action group for provider quick add, deep links, and manual mapping entry points. */
// src/content/anilist/anime-page/media-actions.tsx

import React from 'react';
import Button from '@/shared/ui/primitives/button';
import { SquareArrowOutUpRight, ChevronDown } from 'lucide-react';
import { Dropdown, DropdownItem } from '@/shared/ui/primitives/dropdown';
import type { Provider } from '@/providers';
import { getProviderLabel } from '@/providers/provider-labels';
import type { ProviderActionModel } from '@/features/provider-action';

interface MediaActionsProps {
  provider: Provider;
  actionModel: ProviderActionModel;
  externalHref: string | null;
  onPrimaryAction: () => void;
  onOpenSetup: () => void;
  onOpenMapping: () => void;
  portalContainer?: HTMLElement | undefined;
}

function getPrimaryButtonText(input: {
  providerLabel: string;
  actionModel: ProviderActionModel;
}): string {
  const { providerLabel, actionModel } = input;

  switch (actionModel.state) {
    case 'unconfigured': {
      return `Configure ${providerLabel}`;
    }
    case 'checking': {
      return `Checking ${providerLabel}...`;
    }
    case 'in-library': {
      return `In ${providerLabel}`;
    }
    case 'can-add': {
      return `Add to ${providerLabel}`;
    }
    case 'unmapped': {
      return 'Find match';
    }
    case 'unknown': {
      return 'Retry check';
    }
    case 'adding': {
      return 'Adding...';
    }
    case 'error': {
      return actionModel.primaryAction === 'retry-add'
        ? 'Retry add'
        : 'Retry check';
    }
    default: {
      return providerLabel;
    }
  }
}

function getPrimaryButtonTooltip(input: {
  providerLabel: string;
  actionModel: ProviderActionModel;
}): string | undefined {
  const { providerLabel, actionModel } = input;

  switch (actionModel.state) {
    case 'unconfigured': {
      return `Open ${providerLabel} settings to continue.`;
    }
    case 'checking': {
      return `Checking ${providerLabel} status...`;
    }
    case 'in-library': {
      return `Already in ${providerLabel}`;
    }
    case 'unmapped': {
      return `No automatic ${providerLabel} match was found. Search manually.`;
    }
    case 'unknown': {
      return `Unable to determine ${providerLabel} status right now. Retry the check.`;
    }
    case 'adding': {
      return `Submitting add request to ${providerLabel}...`;
    }
    case 'error': {
      return actionModel.primaryAction === 'retry-add'
        ? `Unable to add this title to ${providerLabel}. Retry the add.`
        : `Unable to determine ${providerLabel} status right now. Retry the check.`;
    }
    default: {
      return undefined;
    }
  }
}

function getLoadingText(input: {
  providerLabel: string;
  actionModel: ProviderActionModel;
}): string {
  return input.actionModel.state === 'adding'
    ? 'Adding...'
    : `Checking ${input.providerLabel}...`;
}

const MediaActions: React.FC<MediaActionsProps> = ({
  provider,
  actionModel,
  externalHref,
  onPrimaryAction,
  onOpenSetup,
  onOpenMapping,
  portalContainer,
}) => {
  const providerLabel = getProviderLabel(provider);
  const isLoading =
    actionModel.state === 'checking' || actionModel.state === 'adding';
  const hasMenu = actionModel.showSetupAction || actionModel.showMappingAction;
  const manualMappingLabel = actionModel.hasMapping
    ? 'Update mapping manually'
    : 'Find match manually';
  const primaryButtonText = getPrimaryButtonText({
    providerLabel,
    actionModel,
  });
  const primaryButtonTooltip = getPrimaryButtonTooltip({
    providerLabel,
    actionModel,
  });

  const Group: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="relative flex items-stretch rounded-[3px] overflow-hidden" role="group" style={{ width: '100%' }}>
      {children}
    </div>
  );

  return (
    <div className={`grid ${actionModel.showExternalAction && externalHref ? 'grid-cols-[1fr_auto] gap-3.75' : 'grid-cols-1 gap-0'} items-start w-full`}>
      <Group>
        <Button
          data-testid="a2a-main-action-button"
          size="md"
          onClick={onPrimaryAction}
          isLoading={isLoading}
          disabled={actionModel.disablePrimaryAction}
          {...(primaryButtonTooltip ? { tooltip: primaryButtonTooltip } : {})}
          tooltipContainer={portalContainer}
          className={`h-8.75 text-[14px] text-center px-0 pl-2.5 ${
            hasMenu
              ? 'flex-1 w-[calc(100%-34px)] rounded-none'
              : 'w-full rounded-[3px]'
          }`}
          loadingText={getLoadingText({ providerLabel, actionModel })}
        >
          {primaryButtonText}
        </Button>

        {hasMenu ? (
          <Dropdown
            container={portalContainer ?? null}
            trigger={
              <Button
                data-testid="a2a-actions-dropdown"
                size="icon"
                variant="primary"
                tooltipContainer={portalContainer}
                className="relative rounded-none h-8.75 w-8.5 after:content-[''] after:absolute after:inset-0 after:bg-[rgba(255,255,255,0.14)] after:pointer-events-none"
                aria-label="Actions"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            }
          >
            {actionModel.showSetupAction ? (
              <DropdownItem onSelect={onOpenSetup}>
                {providerLabel} options
              </DropdownItem>
            ) : null}
            {actionModel.showMappingAction ? (
              <DropdownItem onSelect={onOpenMapping}>
                {manualMappingLabel}
              </DropdownItem>
            ) : null}
          </Dropdown>
        ) : null}
      </Group>

      {actionModel.showExternalAction && externalHref ? (
        <Button
          asChild
          size="icon"
          variant="primary"
          tooltip={`Open in ${providerLabel}`}
          tooltipContainer={portalContainer}
          className="h-8.75 w-8.75 rounded-[3px]"
        >
          <a href={externalHref} target="_blank" rel="noopener noreferrer">
            <SquareArrowOutUpRight className="h-4 w-4" />
          </a>
        </Button>
      ) : null}
    </div>
  );
};

export default MediaActions;
