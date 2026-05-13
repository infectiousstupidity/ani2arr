/** Local options-page section and row layout helpers for dense settings screens. */
// src/options-page/components/settings-section.tsx

import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { Label } from "./ui/label";

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  divider?: "header" | "top" | "none";
  hideHeaderOnDesktop?: boolean;
}

export function SettingsSection({
  title,
  description,
  icon,
  children,
  className,
  divider = "header",
  hideHeaderOnDesktop = false,
}: SettingsSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col",
        divider === "top" && "border-t border-border-primary/50 pt-8",
        className,
      )}
    >
      <header className={cn(
        "mb-6 md:mb-8",
        divider === "header" && "border-b border-border-primary/50 pb-5",
        hideHeaderOnDesktop && "md:hidden"
      )}>
        <div className="flex items-center gap-3">
          {icon ? (
            <span className="hidden h-5 w-5 items-center justify-center text-text-secondary md:flex">
              {icon}
            </span>
          ) : null}
          <h2 className="text-xl font-semibold text-text-primary md:text-lg">
            {title}
          </h2>
        </div>
        {description ? (
          <p className="mt-1.5 max-w-4xl text-sm text-text-secondary leading-relaxed">
            {description}
          </p>
        ) : null}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  id?: string;
  label: string;
  description?: ReactNode;
  children: ReactNode;
  inlineOnMobile?: boolean;
  className?: string;
  controlClassName?: string;
}

export function SettingsRow({
  id,
  label,
  description,
  children,
  inlineOnMobile = false,
  className,
  controlClassName,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] md:gap-8 items-start",
        inlineOnMobile && "flex-row items-center justify-between gap-4 md:grid",
        className,
      )}
    >
      <div className="min-w-0 md:pt-2.5">
        <Label htmlFor={id} className="text-sm font-medium text-text-primary cursor-pointer">
          {label}
        </Label>
        {description ? (
          <div className="mt-1 text-xs text-text-secondary leading-relaxed pr-4">
            {description}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          "min-w-0 w-full",
          inlineOnMobile && "w-auto md:w-full md:flex md:justify-end shrink-0",
          controlClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
