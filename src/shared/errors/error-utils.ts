/** Shared helpers for creating, normalizing, and logging extension errors. */
// src/shared/errors/error-utils.ts

import { ErrorCode, type ExtensionError } from "./error.types";
import { logger } from "@/shared/utils/logger";

const errorLogger = logger.create("Error");

export function createError(
	code: ErrorCode,
	message: string,
	userMessage: string,
	details?: Record<string, unknown>,
): ExtensionError {
	return Object.freeze({
		code,
		message,
		userMessage,
		details: details ?? {},
		timestamp: Date.now(),
	});
}

export function normalizeError(error: unknown): ExtensionError {
	if (
		error &&
		typeof error === "object" &&
		"code" in error &&
		"userMessage" in error
	) {
		return error as ExtensionError;
	}
	if (error instanceof Error) {
		if (error.name === "TypeError" && error.message.includes("fetch")) {
			return createError(
				ErrorCode.NETWORK_ERROR,
				error.message,
				"Unable to connect. Check the URL, your network, and CORS settings.",
				{ originalStack: error.stack },
			);
		}
		return createError(
			ErrorCode.UNKNOWN_ERROR,
			error.message,
			"An unexpected error occurred. Please try again.",
			{ originalStack: error.stack },
		);
	}
	return createError(
		ErrorCode.UNKNOWN_ERROR,
		"An unknown value was thrown.",
		"An unexpected error occurred.",
		{ originalValue: String(error) },
	);
}

export function getUserErrorMessage(
	error: unknown,
	fallback: string,
): string {
	if (
		error &&
		typeof error === "object" &&
		"userMessage" in error &&
		typeof error.userMessage === "string" &&
		error.userMessage.trim()
	) {
		return error.userMessage;
	}
	if (error instanceof Error && error.message.trim()) return error.message;
	if (typeof error === "string" && error.trim()) return error;
	return fallback;
}

export function logError(error: ExtensionError, context?: string): void {
	const contextLabel = context ? `${context} | ` : "";
	errorLogger.error(`${contextLabel}[${error.code}] - ${error.message}`, {
		userMessage: error.userMessage,
		details: error.details,
		timestamp: new Date(error.timestamp).toISOString(),
	});
}
