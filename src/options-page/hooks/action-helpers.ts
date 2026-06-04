/** Shared helpers for options-page actions. */
// src/options-page/hooks/action-helpers.ts

import type { ExtensionError } from "@/shared/errors/error.types";

function isExtensionError(error: unknown): error is ExtensionError {
	if (!error || typeof error !== "object" || !("userMessage" in error)) {
		return false;
	}

	return typeof error.userMessage === "string";
}

export function getActionErrorMessage(error: unknown, fallback: string): string {
	if (isExtensionError(error) && error.userMessage.length > 0) {
		return error.userMessage;
	}

	if (error instanceof Error && error.message.length > 0) return error.message;
	if (typeof error === "string" && error.length > 0) return error;
	return fallback;
}
