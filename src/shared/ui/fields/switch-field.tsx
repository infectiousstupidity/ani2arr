/** Labeled switch field composite with stacked and inline layouts. */
// src/shared/ui/fields/switch-field.tsx
import { forwardRef, useId } from 'react';
import type { FieldProps } from './field-props';
import { FieldLabel } from './field-label';
import { Field } from './field';
import { Switch } from '../primitives/switch';
import type { FloatingPortalContainer } from '../portal-container';

type SwitchFieldExtraProps = {
  labelHelp?: React.ReactNode | undefined;
  labelHelpDelay?: number | undefined;
  labelHelpContainer?: FloatingPortalContainer | undefined;
  layout?: 'stacked' | 'inline' | undefined;
  containerClassName?: string | undefined;
  labelClassName?: string | undefined;
  switchClassName?: string | undefined;
  descriptionClassName?: string | undefined;
  onChange?: ((checked: boolean) => void) | undefined;
};

type SwitchFieldLayoutProps = {
  label: string;
  className?: string | undefined;
  description?: React.ReactNode;
  labelHelp?: React.ReactNode;
  labelHelpDelay?: number | undefined;
  labelHelpContainer?: FloatingPortalContainer | undefined;
  containerClassName?: string | undefined;
  labelClassName?: string | undefined;
  descriptionClassName?: string | undefined;
  descriptionId: string;
  switchElement: React.ReactNode;
};

function renderInlineSwitchField(props: SwitchFieldLayoutProps): React.JSX.Element {
  const {
    label,
    className,
    description,
    labelHelp,
    labelHelpDelay,
    labelHelpContainer,
    containerClassName,
    labelClassName,
    descriptionClassName,
    descriptionId,
    switchElement,
  } = props;

  return (
    <Field>
      <div className={className}>
        <div className={`flex items-center justify-between gap-4 ${containerClassName ?? ''}`}>
          <div className="min-w-0 flex-1">
            <FieldLabel
              label={label}
              labelHelp={labelHelp}
              labelHelpDelay={labelHelpDelay}
              labelHelpContainer={labelHelpContainer}
              className={`mb-0 text-sm text-text-primary ${labelClassName ?? ''}`}
            />
            {description && (
              <div id={descriptionId} className={`mt-1 text-xs text-text-secondary ${descriptionClassName ?? ''}`}>
                {description}
              </div>
            )}
          </div>
          {switchElement}
        </div>
      </div>
    </Field>
  );
}

function renderStackedSwitchField(props: SwitchFieldLayoutProps): React.JSX.Element {
  const {
    label,
    className,
    description,
    labelHelp,
    labelHelpDelay,
    labelHelpContainer,
    containerClassName,
    labelClassName,
    descriptionClassName,
    descriptionId,
    switchElement,
  } = props;

  return (
    <Field>
      <div
        className={`flex flex-col items-center justify-center rounded-lg bg-bg-tertiary p-3 text-center ${containerClassName ?? ''} ${className ?? ''}`}
      >
        <FieldLabel
          label={label}
          labelHelp={labelHelp}
          labelHelpDelay={labelHelpDelay}
          labelHelpContainer={labelHelpContainer}
          className={`${labelHelp ? 'mb-0' : 'mb-2'} text-xs text-text-secondary ${labelClassName ?? ''}`}
          wrapperClassName="mb-2 flex items-center gap-2"
        />
        {switchElement}
        {description && (
          <div id={descriptionId} className={`mt-1 text-xs text-text-secondary ${descriptionClassName ?? ''}`}>
            {description}
          </div>
        )}
      </div>
    </Field>
  );
}

export const SwitchField = forwardRef<
  React.ComponentRef<typeof Switch>,
  FieldProps & Omit<React.ComponentProps<typeof Switch>, 'onChange'> & SwitchFieldExtraProps
>(
  (
    {
      label,
      className,
      description,
      labelHelp,
      labelHelpDelay,
      labelHelpContainer,
      layout = 'stacked',
      containerClassName,
      labelClassName,
      switchClassName,
      descriptionClassName,
      onChange,
      onCheckedChange,
      ...props
    },
    ref,
  ) => {
    const descriptionId = useId();
    const effectiveOnCheckedChange = onCheckedChange ?? onChange;

    const switchProps = {
      ...props,
      ...(effectiveOnCheckedChange ? { onCheckedChange: effectiveOnCheckedChange } : {}),
    };
    const switchElement = (
      <Switch
        ref={ref}
        {...switchProps}
        className={switchClassName}
        aria-describedby={description ? descriptionId : undefined}
      />
    );
    const layoutProps = {
      label,
      className,
      description,
      labelHelp,
      labelHelpDelay,
      labelHelpContainer,
      containerClassName,
      labelClassName,
      descriptionClassName,
      descriptionId,
      switchElement,
    };

    if (layout === 'inline') {
      return renderInlineSwitchField(layoutProps);
    }

    return renderStackedSwitchField(layoutProps);
  },
);
SwitchField.displayName = 'SwitchField';
