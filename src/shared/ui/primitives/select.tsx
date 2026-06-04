/** Radix select primitives plus a small option-list control. */
// src/shared/ui/primitives/select.tsx
import { forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useOptionalFieldId } from '@/shared/ui/fields/field-context';
import { cn } from '@/shared/utils/cn';

export function Select(
  props: React.ComponentProps<typeof SelectPrimitive.Root>,
): React.JSX.Element {
  return <SelectPrimitive.Root {...props} />;
}

export const SelectTrigger = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, id, ...props }, ref) => {
  const fieldId = useOptionalFieldId();

  return (
    <SelectPrimitive.Trigger
      id={id ?? fieldId}
      ref={ref}
      className={cn(
        'flex h-[48px] w-full items-center justify-between gap-2 rounded-md border border-border-primary bg-bg-secondary px-3.5 py-2 text-sm text-text-primary transition-colors data-placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary md:h-[44px] [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    container?: HTMLElement | ShadowRoot | null | undefined;
  }
>(({ className, children, container, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal container={container as HTMLElement | ShadowRoot | null}>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-50 max-h-96 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border-primary bg-bg-secondary text-text-primary shadow-xl data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="w-full p-1">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-[40px] w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none transition-colors focus:bg-bg-tertiary focus:text-text-primary data-disabled:pointer-events-none data-disabled:opacity-50 data-[state=checked]:text-accent-primary',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-accent-primary" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText asChild>
      <span className="flex-1 truncate">{children}</span>
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

export function SelectValue(
  props: React.ComponentProps<typeof SelectPrimitive.Value>,
): React.JSX.Element {
  return <SelectPrimitive.Value {...props} />;
}

export interface SelectControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  id?: string | undefined;
  container?: HTMLElement | ShadowRoot | null | undefined;
}

export function SelectControl({
  value,
  onValueChange,
  options,
  disabled = false,
  placeholder,
  id,
  container,
}: SelectControlProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent container={container}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
