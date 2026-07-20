/** Radix switch primitive wired to shared field IDs when present. */
// src/shared/ui/primitives/switch.tsx
import { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useOptionalFieldId } from '@/shared/ui/fields/field-context';
import { cn } from '@/shared/utils/cn';

export const Switch = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, id, ...props }, ref) => {
  const fieldId = useOptionalFieldId();

  return (
    <SwitchPrimitive.Root
      id={id ?? fieldId}
      ref={ref}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-bg-tertiary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';
