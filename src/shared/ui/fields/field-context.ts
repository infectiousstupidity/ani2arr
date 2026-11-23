/** Stores shared field IDs for accessible labels and controls. */
// src/shared/ui/fields/field-context.ts
import { createContext, useContext } from 'react';

export const FormItemContext = createContext<{ id: string } | undefined>(undefined);

export function useOptionalFieldId(): string | undefined {
  return useContext(FormItemContext)?.id;
}
