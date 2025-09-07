// SelectContent.tsx  –  single drop-in wrapper
import * as SelectPrimitive from "@radix-ui/react-select";
import React from "react";

type Props = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  container?: HTMLElement | null;
};

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  Props
>(({ container, children, ...rest }, ref) => (
  <SelectPrimitive.Portal container={container ?? undefined}>
    <SelectPrimitive.Content
      ref={ref}
      position="popper"
      className="relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-bg-secondary text-text-primary shadow-md"
      {...rest}
    >
      <SelectPrimitive.Viewport className="p-1">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";
