// src/ui/TooltipWrapper.tsx
import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { CircleHelp } from 'lucide-react';

export interface TooltipWrapperProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  container?: HTMLElement | null;
  showArrow?: boolean;
}

const TooltipWrapper: React.FC<TooltipWrapperProps> = ({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 5,
  container,
  showArrow = true,
}) => (
  <Tooltip.Root delayDuration={100} disableHoverableContent>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal container={container}>
      <Tooltip.Content
        className="pointer-events-none text-[13px] font-medium text-[rgba(255,255,255,0.92)] bg-[rgba(10,15,23,0.95)] border border-[rgba(255,255,255,0.08)] rounded-md px-2.5 py-1.5 shadow-[0_12px_24px_rgba(8,12,20,0.35)] backdrop-blur-sm tracking-[0.01em] max-w-60 leading-[1.2] z-99999"
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        {content}
        {showArrow ? <Tooltip.Arrow className="fill-[rgba(10,15,23,0.95)]" /> : null}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export const HelpTooltip: React.FC<Omit<TooltipWrapperProps, 'children'>> = props => (
  <TooltipWrapper {...props}>
    <button type="button" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 cursor-pointer">
      <CircleHelp className="w-4 h-4 text-gray-600 dark:text-gray-300" />
    </button>
  </TooltipWrapper>
);

export default TooltipWrapper;
