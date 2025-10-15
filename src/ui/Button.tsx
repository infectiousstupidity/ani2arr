// src/ui/Button.tsx
import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import TooltipWrapper from './TooltipWrapper';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  loadingText?: string;
  tooltip?: string;
  portalContainer?: HTMLElement | undefined;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText = 'Loading...',
      tooltip,
      portalContainer,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    const variantClasses = {
      primary: 'bg-accent-primary text-white hover:bg-accent-hover disabled:bg-accent-primary/50',
      secondary: 'bg-bg-secondary text-text-primary hover:bg-bg-tertiary disabled:bg-bg-secondary/50',
      outline: 'border border-border-primary text-text-secondary hover:bg-bg-secondary disabled:opacity-50',
      ghost: 'hover:bg-bg-secondary disabled:opacity-50',
    };

    const sizeClasses = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-9 px-4 text-sm',
      lg: 'h-11 px-6 text-lg',
      icon: 'h-9 w-9',
    };

    const button = (
      <Comp
        ref={ref}
        disabled={isLoading || props.disabled}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ''}`}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-currentColor" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {loadingText}
          </>
        ) : (
          children
        )}
      </Comp>
    );

    if (tooltip) {
      return (
        <TooltipWrapper content={tooltip} container={portalContainer ?? null}>
          {button}
        </TooltipWrapper>
      );
    }

    return button;
  },
);
Button.displayName = 'Button';

export default Button;