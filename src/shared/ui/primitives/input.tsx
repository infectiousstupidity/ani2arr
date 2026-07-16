/** Shared text inputs, including API-key PasswordInput behavior. */
// src/shared/ui/primitives/input.tsx

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[48px] md:h-[44px] w-full rounded-md border border-border-primary bg-bg-secondary px-3.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const toggleLabel = showPassword ? "Hide API key" : "Show API key";

    return (
      <div className="relative w-full">
        <Input
          type={showPassword ? "text" : "password"}
          className={cn("pr-10", className)}
          ref={ref}
          {...props}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          data-lpignore="true"
          data-1p-ignore="true"
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-0 top-0 flex h-full min-w-[44px] cursor-pointer items-center justify-center text-text-secondary transition-colors hover:text-text-primary"
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
