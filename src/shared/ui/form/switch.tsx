/** Radix switch primitive wired to shared form field IDs. */
// src/shared/ui/form/switch.tsx
import { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useFormField } from './form-context';

export const Switch = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className = '', ...props }, ref) => {
  const { id } = useFormField();

  return (
    <SwitchPrimitive.Root
      id={id}
      ref={ref}
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-bg-tertiary ${className}`}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';
