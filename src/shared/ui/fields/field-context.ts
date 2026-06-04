/** Stores shared field IDs for accessible labels and controls. */
// src/shared/ui/fields/field-context.ts
import { createContext, useContext } from 'react';

export const FormItemContext = createContext<{ id: string } | undefined>(undefined);

export function useFormField(): { id: string } {
  const context = useContext(FormItemContext);
  if (!context) throw new Error('useFormField must be used within <Field>');
  return context;
}

export function useOptionalFieldId(): string | undefined {
  return useContext(FormItemContext)?.id;
}

/** LEGACY: Keep old helper name until all callers use useOptionalFieldId. */
export const useOptionalFormFieldId = useOptionalFieldId;
