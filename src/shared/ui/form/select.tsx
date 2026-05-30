/** Radix select primitives styled for shared form controls. */
// src/shared/ui/form/select.tsx
import { forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useFormField } from './form-context';

export function Select(
  props: React.ComponentProps<typeof SelectPrimitive.Root>,
): React.JSX.Element {
  return <SelectPrimitive.Root {...props} />;
}

export const SelectTrigger = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className = '', children, ...props }, ref) => {
  const { id } = useFormField();

  return (
    <SelectPrimitive.Trigger
      id={id}
      ref={ref}
      className={`flex h-9 w-full items-center justify-between rounded-md bg-bg-primary px-3 py-2 text-sm text-text-primary data-placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20 ${className}`}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
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
>(({ className = '', children, container, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal container={container as HTMLElement | ShadowRoot | null}>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={`relative z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-bg-primary bg-bg-secondary text-text-primary shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className}`}
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
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-bg-tertiary focus:text-text-primary data-[state=checked]:text-accent-primary ${className}`}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
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
