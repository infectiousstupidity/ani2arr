/** Shared tooltip primitives for help affordances and wrapped hover content. */
// src/shared/ui/primitives/tooltip.tsx
import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { FloatingPortalContainer } from '../portal-container';

interface TooltipWrapperProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  container?: FloatingPortalContainer;
  showArrow?: boolean;
  delayDuration?: number;
  disableHoverableContent?: boolean;
  contentClassName?: string;
}

export const TooltipProvider = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tooltip.Provider>): React.JSX.Element => (
  <Tooltip.Provider {...props}>{children}</Tooltip.Provider>
);

const TooltipWrapper: React.FC<TooltipWrapperProps> = ({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 5,
  container,
  showArrow = true,
  delayDuration = 100,
  disableHoverableContent = true,
  contentClassName,
}) => (
  <Tooltip.Root
    delayDuration={delayDuration}
    disableHoverableContent={disableHoverableContent}
  >
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal container={container}>
      <Tooltip.Content
        className={cn(
          'a2a-tooltip-content pointer-events-none text-[13px] font-medium text-[rgba(255,255,255,0.92)] bg-[rgba(10,15,23,0.95)] border border-[rgba(255,255,255,0.08)] rounded-md px-2.5 py-1.5 shadow-[0_12px_24px_rgba(8,12,20,0.35)] backdrop-blur-sm tracking-[0.01em] max-w-60 leading-[1.2] z-99999',
          contentClassName,
        )}
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        {content}
        {showArrow ? <Tooltip.Arrow className="a2a-tooltip-arrow fill-[rgba(10,15,23,0.95)]" /> : null}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export const HelpTooltip: React.FC<Omit<TooltipWrapperProps, 'children'>> = props => (
  <TooltipWrapper {...props}>
    <button
      type="button"
      aria-label="More information"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-tertiary text-text-secondary"
    >
      <CircleHelp className="w-4 h-4 text-text-secondary" />
    </button>
  </TooltipWrapper>
);

export default TooltipWrapper;
