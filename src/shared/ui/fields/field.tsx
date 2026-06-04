/** Provides one stable shared ID to a label and control pair. */
// src/shared/ui/fields/field.tsx
import { useId, type ReactNode } from 'react';
import { FormItemContext } from './field-context';

export function Field({ children }: { children: ReactNode }): React.JSX.Element {
  const id = useId();

  return <FormItemContext.Provider value={{ id }}>{children}</FormItemContext.Provider>;
}

/** LEGACY: Old name kept during form-folder removal; remove after callers use Field. */
export const FormField = Field;
