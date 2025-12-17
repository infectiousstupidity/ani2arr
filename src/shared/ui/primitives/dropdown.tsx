// src/shared/components/dropdown.tsx
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
          className="rounded-md bg-[#ffffff] text-(--text-secondary) border-0 shadow-[0_1px_10px_rgba(49,54,68,0.15)] py-1.5 z-99999"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          {children}
          <DropdownMenu.Arrow className="fill-[#ffffff] stroke-transparent" />
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
    className={`text-[14px] leading-[30px] rounded-sm flex items-center px-[17px] select-none ${
      disabled
        ? 'opacity-50 cursor-not-allowed text-text-secondary'
        : 'text-text-secondary cursor-pointer hover:bg-accent-primary hover:text-white'
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
