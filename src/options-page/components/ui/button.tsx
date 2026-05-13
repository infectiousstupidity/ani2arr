import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/utils/cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex h-[44px] md:h-[40px] items-center justify-center whitespace-nowrap rounded-md px-5 text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-accent-primary text-white hover:bg-accent-hover": variant === "primary",
            "bg-bg-tertiary text-text-primary hover:bg-border-primary": variant === "secondary",
            "border border-border-primary bg-transparent text-text-primary hover:bg-bg-tertiary": variant === "outline",
            "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50": variant === "ghost",
            "bg-error/10 text-error hover:bg-error/20 border border-error/20": variant === "destructive",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
