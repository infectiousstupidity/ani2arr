// src/ui/Form.tsx
import React, { createContext, useContext, useId } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown } from 'lucide-react';

type FormItemContextValue = {
  id: string;
};

const FormItemContext = createContext<FormItemContextValue | undefined>(undefined);

const useFormField = () => {
  const itemContext = useContext(FormItemContext);
  if (!itemContext) {
    throw new Error('useFormField should be used within <FormField>');
  }
  const id = itemContext.id;
  return { id };
};

const FormField: React.FC<{ children: React.ReactNode }> = React.memo(({ children }) => {
  const id = useId();
  return <FormItemContext.Provider value={{ id }}>{children}</FormItemContext.Provider>;
});
FormField.displayName = 'FormField';

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`grid grid-cols-2 items-center gap-4 ${className}`}
      {...props}
    />
  ),
);
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className = '', ...props }, ref) => {
  const { id } = useFormField();
  return (
    <LabelPrimitive.Root
      ref={ref}
      htmlFor={id}
      className={`text-sm font-medium text-text-primary ${className}`}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ ...props }, ref) => {
    return <div ref={ref} {...props} />;
  },
);
FormControl.displayName = 'FormControl';

const Input = React.memo(
  React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className = '', type, ...props }, ref) => {
      const { id } = useFormField();
      return (
        <input
          id={id}
          type={type}
          ref={ref}
          className={`flex h-9 w-full rounded-md border border-border-primary bg-bg-tertiary px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
          {...props}
        />
      );
    },
  ),
);
Input.displayName = 'Input';

const Switch = React.memo(
  React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
  >(({ className = '', ...props }, ref) => {
    const { id } = useFormField();
    return (
      <SwitchPrimitive.Root
        id={id}
        className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-bg-tertiary ${className}`}
        {...props}
        ref={ref}
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitive.Root>
    );
  }),
);
Switch.displayName = SwitchPrimitive.Root.displayName;

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.memo(
  React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
  >(({ className = '', children, ...props }, ref) => {
    const { id } = useFormField();
    return (
      <SelectPrimitive.Trigger
        id={id}
        ref={ref}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-border-primary bg-bg-tertiary px-3 py-2 text-sm ring-offset-background placeholder:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    );
  }),
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.memo(
  React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { container?: HTMLElement | null }
  >(({ className = '', children, position = 'popper', container, ...props }, ref) => {
    return (
      <SelectPrimitive.Portal container={container ?? undefined}>
        <SelectPrimitive.Content
          ref={ref}
          className={`relative z-50 min-w-32 w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border-primary bg-bg-secondary text-text-primary shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className}`}
          position={position}
          {...props}
        >
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  }),
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.memo(
  React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
  >(({ className = '', children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm data-disabled:pointer-events-none data-disabled:opacity-50 ${className}`}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )),
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

export {
  useFormField,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  Input,
  Switch,
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
};
