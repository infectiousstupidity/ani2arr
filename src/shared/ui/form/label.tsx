/** Radix label primitive wired to shared form field IDs. */
// src/shared/ui/form/label.tsx
import { forwardRef } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { useOptionalFormFieldId } from './form-context';

export const Label = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className = '', htmlFor, ...props }, ref) => {
  const fieldId = useOptionalFormFieldId();
  const derivedId = htmlFor ?? fieldId;

  return (
    <LabelPrimitive.Root
      ref={ref}
      htmlFor={derivedId}
      className={`block text-sm font-medium text-text-primary mb-2 ${className}`}
      {...props}
    />
  );
});
Label.displayName = 'FormLabel';
