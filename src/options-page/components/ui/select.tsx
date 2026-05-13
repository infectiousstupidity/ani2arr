/** Local select control for options-page settings fields. */
// src/options-page/components/ui/select.tsx

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export const Select = ({ value, onValueChange, options, disabled, placeholder, id }: SelectProps) => {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled ?? false}>
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "flex h-[48px] md:h-[44px] w-full items-center justify-between gap-2 rounded-md border border-border-primary bg-bg-secondary px-3.5 py-2 text-sm text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors [&>span]:truncate"
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="relative z-50 max-h-96 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border-primary bg-bg-secondary text-text-primary shadow-xl">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex min-h-[40px] w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none focus:bg-bg-tertiary data-disabled:pointer-events-none data-disabled:opacity-50 transition-colors"
              >
                <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-accent-primary" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
