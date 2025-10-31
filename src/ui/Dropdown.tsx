// src/ui/Dropdown.tsx
import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  container?: HTMLElement | null;
}

export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, container }) => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container ?? undefined}>
        <DropdownMenu.Content
          className="min-w-[180px] rounded-[6px] bg-[rgba(10,15,23,0.95)] text-[rgba(255,255,255,0.92)] border border-[rgba(255,255,255,0.12)] p-1 shadow-[0_12px_24px_rgba(8,12,20,0.35)] outline-none focus-visible:outline-none z-[99999]"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          {children}
          <DropdownMenu.Arrow className="fill-[rgba(10,15,23,0.95)] stroke-[rgba(255,255,255,0.12)]" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export const DropdownItem: React.FC<{
  onSelect?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onSelect, disabled, children }) => (
  <DropdownMenu.Item
    className={`text-sm leading-none rounded-[4px] flex items-center h-8 px-3 select-none outline-none focus-visible:outline-none ${
      disabled
        ? 'opacity-50 cursor-not-allowed text-[rgba(255,255,255,0.5)]'
        : 'text-[rgba(255,255,255,0.92)] hover:bg-[rgba(255,255,255,0.06)]'
    }`}
    onSelect={() => {
      if (!disabled) onSelect?.();
    }}
    disabled={!!disabled}
  >
    {children}
  </DropdownMenu.Item>
);

export default Dropdown;
