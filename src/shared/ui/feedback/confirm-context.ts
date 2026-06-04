// src/shared/ui/feedback/confirm-context.ts
// Shared context and types for the confirmation dialog provider and hook.

import { createContext, type ReactNode } from "react";

export type ConfirmOptions = {
	title?: ReactNode;
	description?: ReactNode;
	confirmText?: string;
	cancelText?: string;
};

export type ConfirmContextValue = {
	confirm: (options?: ConfirmOptions) => Promise<boolean>;
};

export const ConfirmContext = createContext<ConfirmContextValue | null>(null);
