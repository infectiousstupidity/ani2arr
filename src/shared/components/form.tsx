// src/shared/components/form.tsx
import React, { createContext, useContext, useId } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown } from 'lucide-react';
import TooltipWrapper from './tooltip';

// --- 1. Accessibility Context ---
const FormItemContext = createContext<{ id: string } | undefined>(undefined);

const useFormField = () => {
  const context = useContext(FormItemContext);
  if (!context) throw new Error('useFormField must be used within <FormField>');
  return context;
};

export const FormField: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const id = useId();
  return <FormItemContext.Provider value={{ id }}>{children}</FormItemContext.Provider>;
};

// --- 2. Primitives ---

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className = '', ...props }, ref) => {
  const { id } = useFormField();
  return (
    <LabelPrimitive.Root
      ref={ref}
      htmlFor={id}
      className={`block text-sm font-medium text-text-primary mb-2 ${className}`}
      {...props}
    />
  );
});
Label.displayName = 'FormLabel';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    const { id } = useFormField();
    return (
      <input
        id={id}
        ref={ref}
        className={`flex h-10 w-full rounded-md bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20 ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className = '', ...props }, ref) => {
  const { id } = useFormField();
  return (
    <SwitchPrimitive.Root
      id={id}
      ref={ref}
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-bg-tertiary ${className}`}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';

// --- Select Primitive Wrappers ---
const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className = '', children, ...props }, ref) => {
  const { id } = useFormField();
  return (
    <SelectPrimitive.Trigger
      id={id}
      ref={ref}
      className={`flex h-9 w-full items-center justify-between rounded-md bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20 ${className}`}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { container?: HTMLElement | ShadowRoot | null | undefined }
>(({ className = '', children, container, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal container={container as HTMLElement | ShadowRoot | null}>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={`relative z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-bg-primary bg-bg-secondary text-text-primary shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className}`}
      {...props}
    >
      <SelectPrimitive.Viewport className="w-full p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-bg-tertiary focus:text-text-primary data-[state=checked]:text-accent-primary ${className}`}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

// --- 3. HIGH LEVEL COMPOSITES ---

interface FieldProps {
  label: string;
  className?: string;
  description?: React.ReactNode;
}

export const InputField = React.forwardRef<HTMLInputElement, FieldProps & React.ComponentProps<typeof Input>>(
  ({ label, className, description, ...props }, ref) => (
    <FormField>
      <div className={`space-y-3 ${className}`}>
        <Label>{label}</Label>
        <Input ref={ref} {...props} />
        {description && <p className="text-xs text-text-secondary">{description}</p>}
      </div>
    </FormField>
  )
);
InputField.displayName = 'InputField';

type SwitchFieldExtraProps = {
  labelHelp?: React.ReactNode;
  labelHelpDelay?: number;
  labelHelpContainer?: HTMLElement | ShadowRoot | null;
};

export const SwitchField = React.forwardRef<
  React.ComponentRef<typeof Switch>,
  FieldProps & React.ComponentProps<typeof Switch> & SwitchFieldExtraProps
>(({ label, className, description, labelHelp, labelHelpDelay, labelHelpContainer, ...props }, ref) => (
    <FormField>
      <div className={`flex flex-col items-center justify-center rounded-lg bg-bg-tertiary p-3 text-center ${className}`}>
        {labelHelp ? (
          <TooltipWrapper content={labelHelp} container={labelHelpContainer as HTMLElement | null} delayDuration={labelHelpDelay ?? 500}>
            <Label className="mb-2 text-xs text-text-secondary cursor-help">{label}</Label>
          </TooltipWrapper>
        ) : (
          <Label className="mb-2 text-xs text-text-secondary">{label}</Label>
        )}
        <Switch ref={ref} {...props} />
        {description && <div className="mt-1 text-xs text-text-secondary">{description}</div>}
      </div>
    </FormField>
  )
);
SwitchField.displayName = 'SwitchField';

interface SelectFieldProps extends FieldProps, React.ComponentProps<typeof SelectPrimitive.Root> {
  placeholder?: string;
  options: Array<{ value: string; label: string; description?: string }>;
  container?: HTMLElement | ShadowRoot | null;
  triggerClassName?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
  placeholder,
  container,
  className,
  triggerClassName,
  description,
  ...props
}) => {
  // Helper to find label for display if needed
  const selectedLabel = options.find(o => o.value === props.value)?.label;

  return (
    <FormField>
      <div className={`space-y-3 ${className}`}>
        <Label>{label}</Label>
        <SelectPrimitive.Root {...props}>
          <SelectTrigger className={triggerClassName}>
             {/* Handle complex display logic via children or default to Value */}
            <SelectPrimitive.Value placeholder={placeholder}>
              {selectedLabel}
            </SelectPrimitive.Value>
          </SelectTrigger>
          <SelectContent container={container}>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex w-full items-center justify-between gap-4">
                  <span>{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-text-tertiary opacity-70">{opt.description}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </SelectPrimitive.Root>
        {description && <div className="text-xs text-text-secondary">{description}</div>}
      </div>
    </FormField>
  );
};
