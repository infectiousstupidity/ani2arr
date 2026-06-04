/** Radix label primitive wired to shared field IDs when present. */
// src/shared/ui/primitives/label.tsx
import { forwardRef } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { useOptionalFieldId } from '@/shared/ui/fields/field-context';
import { cn } from '@/shared/utils/cn';

export const Label = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className = '', htmlFor, ...props }, ref) => {
  const fieldId = useOptionalFieldId();
  const derivedId = htmlFor ?? fieldId;

  return (
    <LabelPrimitive.Root
      ref={ref}
      htmlFor={derivedId}
      className={cn('mb-2 block text-sm font-medium text-text-primary', className)}
      {...props}
    />
  );
});
Label.displayName = 'Label';
