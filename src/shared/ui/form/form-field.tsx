/** Provides one stable shared ID to a form label and control pair. */
// src/shared/ui/form/form-field.tsx
import { useId, type ReactNode } from 'react';
import { FormItemContext } from './form-context';

export function FormField({ children }: { children: ReactNode }): React.JSX.Element {
  const id = useId();

  return <FormItemContext.Provider value={{ id }}>{children}</FormItemContext.Provider>;
}
