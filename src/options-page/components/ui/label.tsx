/** Local Radix Label helpers for options page form controls. */
// src/options-page/components/ui/label.tsx

import React, { forwardRef } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/shared/utils/cn";

export const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-sm font-semibold text-text-primary", className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export const Field = ({
  id,
  label,
  description,
  children,
  className,
}: {
  id: string;
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-2", className)}>
    <Label htmlFor={id}>{label}</Label>
    {description && <p className="text-sm leading-6 text-text-secondary md:text-xs md:leading-5">{description}</p>}
    {children}
  </div>
);
