/** Local Radix Tooltip helpers for options page hover content. */
// src/options-page/components/ui/tooltip.tsx
import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/utils/cn";

export const TooltipProvider = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => {
  return <TooltipPrimitive.Provider {...props}>{children}</TooltipPrimitive.Provider>;
};

export const Tooltip = ({
  children,
  content,
  delayDuration = 200,
}: {
  children: React.ReactNode;
  content: string | React.ReactNode;
  delayDuration?: number;
}) => {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={4}
          className={cn(
            "z-50 overflow-hidden rounded-md border border-border-primary bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
