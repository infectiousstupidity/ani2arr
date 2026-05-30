/** Stores shared form field IDs for accessible labels and controls. */
// src/shared/ui/form/form-context.ts
import { createContext, useContext } from 'react';

export const FormItemContext = createContext<{ id: string } | undefined>(undefined);

export function useFormField(): { id: string } {
  const context = useContext(FormItemContext);
  if (!context) throw new Error('useFormField must be used within <FormField>');
  return context;
}

export function useOptionalFormFieldId(): string | undefined {
  return useContext(FormItemContext)?.id;
}
