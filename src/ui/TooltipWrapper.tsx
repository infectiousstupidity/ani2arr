// src/ui/TooltipWrapper.tsx
import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';

export interface TooltipWrapperProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  container?: HTMLElement | null;
}

const TooltipWrapper: React.FC<TooltipWrapperProps> = ({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 5,
  container,
}) => (
  <Tooltip.Provider delayDuration={100}>
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal container={container}>
        <Tooltip.Content
          className="text-[13px] font-medium text-[rgba(255,255,255,0.92)] bg-[rgba(10,15,23,0.95)] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-[10px] py-[6px] shadow-[0_12px_24px_rgba(8,12,20,0.35)] backdrop-blur-sm tracking-[0.01em] max-w-[240px] leading-[1.2] z-[99999]"
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          {content}
          <Tooltip.Arrow className="fill-[rgba(10,15,23,0.95)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
);

export const HelpTooltip: React.FC<Omit<TooltipWrapperProps, 'children'>> = props => (
  <TooltipWrapper {...props}>
    <button type="button" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 cursor-pointer">
      <QuestionMarkCircledIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
    </button>
  </TooltipWrapper>
);

export default TooltipWrapper;