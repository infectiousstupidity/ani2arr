// src/shared/components/pill.tsx
import React from "react";
import { cn } from "@/shared/utils/cn";

type Tone = "muted" | "success" | "warning" | "info" | "accent" | "blue" | "default";

type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  children: React.ReactNode;
  tone?: Tone;
  small?: boolean;
  icon?: React.ComponentType<{ className?: string }> | null;
};

const TONE_CLASSES: Record<Tone, string> = {
  muted: "border-white/15 bg-white/10 text-white/80",
  success: "border-success/25 bg-success/20 text-success",
  warning: "border-amber-200/30 bg-amber-100/15 text-amber-100",
  info: "border-white/15 bg-white/10 text-white/80",
  accent: "bg-accent-primary/20 text-accent-primary",
  blue: "bg-blue-500/15 text-blue-400",
  default: "bg-bg-primary/10 text-text-primary",
};

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(function Pill(props, ref) {
  const { children, tone = "muted", small = false, icon: Icon = null, className, ...rest } = props;

  const base = cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-full align-middle",
    small
      ? "px-2 py-[3px] text-[10px] font-medium leading-none uppercase"
      : "px-3 py-[4px] text-[11px] font-semibold leading-none uppercase"
  );

  return (
    <span ref={ref} className={cn(base, TONE_CLASSES[tone], className)} {...rest}>
      {Icon ? (
        <Icon className={small ? "mr-1 h-3 w-3 shrink-0" : "mr-1 h-3.5 w-3.5 shrink-0"} />
      ) : null}
      {children}
    </span>
  );
});

export default Pill;
