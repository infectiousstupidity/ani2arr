/** Shared button primitive with variants, loading state, and optional tooltip. */
// src/shared/ui/primitives/button.tsx
import { Slot as SlotPrimitive } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/utils/cn";
import TooltipWrapper from "./tooltip";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	asChild?: boolean;
	variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
	size?: "sm" | "md" | "lg" | "icon";
	isLoading?: boolean;
	loadingText?: string;
	tooltip?: string;
	tooltipContainer?: HTMLElement | undefined;
}

const sizeClasses = {
	sm: "h-8 px-3 text-sm",
	md: "h-[44px] px-5 text-sm font-semibold md:h-[40px]",
	lg: "h-11 px-6 text-lg",
	icon: "h-9 w-9",
} as const;

const variantClasses = {
	primary: "bg-accent-primary text-white hover:bg-accent-hover",
	secondary: "bg-bg-tertiary text-text-primary hover:bg-border-primary",
	outline:
		"border border-border-primary bg-transparent text-text-primary hover:bg-bg-tertiary",
	ghost:
		"bg-transparent text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary",
	destructive: "border border-error/20 bg-error/10 text-error hover:bg-error/20",
} as const;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			asChild = false,
			variant = "primary",
			size = "md",
			isLoading = false,
			loadingText = "Loading...",
			tooltip,
			tooltipContainer,
			className = "",
			children,
			disabled = false,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? SlotPrimitive : "button";
		const isDisabled = isLoading || disabled;

		const button = (
			<Comp
				{...props}
				ref={ref}
				disabled={isDisabled}
				className={cn(
					"inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-colors disabled:pointer-events-none disabled:opacity-50",
					variantClasses[variant],
					sizeClasses[size],
					className,
				)}
			>
				{isLoading ? (
					<>
						<svg
							className="-ml-1 mr-3 h-5 w-5 animate-spin text-current"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						{loadingText}
					</>
				) : (
					children
				)}
			</Comp>
		);

		return tooltip ? (
			<TooltipWrapper content={tooltip} container={tooltipContainer ?? null}>
				{button}
			</TooltipWrapper>
		) : (
			button
		);
	},
);

Button.displayName = "Button";

export default Button;
