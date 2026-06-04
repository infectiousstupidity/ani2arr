/** Labeled select field composite with options list and optional help tooltip. */
// src/shared/ui/fields/select-field.tsx
import { useId } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import type { FieldProps } from './field-props';
import { FieldLabel } from './field-label';
import { Field } from './field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../primitives/select';

interface SelectFieldProps
  extends FieldProps,
    Omit<React.ComponentProps<typeof SelectPrimitive.Root>, 'onChange'> {
  placeholder?: string;
  options: Array<{ value: string; label: string; description?: string }>;
  container?: HTMLElement | ShadowRoot | null | undefined;
  triggerClassName?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
}

export function SelectField({
  label,
  options,
  placeholder,
  container,
  className,
  triggerClassName,
  description,
  labelHelp,
  labelHelpDelay,
  labelHelpContainer,
  onChange,
  onValueChange,
  ...props
}: SelectFieldProps): React.JSX.Element {
  const descriptionId = useId();
  const effectiveOnValueChange = onValueChange ?? onChange;
  const rootProps = {
    ...props,
    ...(effectiveOnValueChange ? { onValueChange: effectiveOnValueChange } : {}),
  };

  return (
    <Field>
      <div className={`space-y-3 ${className ?? ''}`}>
        <FieldLabel
          label={label}
          labelHelp={labelHelp}
          labelHelpDelay={labelHelpDelay}
          labelHelpContainer={labelHelpContainer}
          className={labelHelp ? 'mb-0' : undefined}
        />
        <Select {...rootProps}>
          <SelectTrigger
            className={triggerClassName}
            aria-describedby={description ? descriptionId : undefined}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent container={container}>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {description && (
          <div id={descriptionId} className="text-xs text-text-secondary">
            {description}
          </div>
        )}
      </div>
    </Field>
  );
}
