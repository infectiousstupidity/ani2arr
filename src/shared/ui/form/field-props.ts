/** Shared form field prop types for labeled input, select, and switch composites. */
// src/shared/ui/form/field-props.ts
import type { ReactNode } from 'react';

export interface FieldProps {
  label: string;
  className?: string | undefined;
  description?: ReactNode | undefined;
  labelHelp?: ReactNode | undefined;
  labelHelpDelay?: number | undefined;
  labelHelpContainer?: HTMLElement | ShadowRoot | null | undefined;
}
