// src/utils/error-handling.tsx

/**
 * @file Provides a robust, standardized error handling system for the extension.
 */
import React from 'react';

/**
 * A controlled vocabulary of internal error codes.
 * This helps in categorizing and handling errors programmatically.
 */
export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  API_ERROR = 'API_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * The standard shape for all errors within the application.
 * This ensures consistency in how errors are created, passed, and logged.
 */
export interface ExtensionError {
  /** The internal error code from the `ErrorCode` enum. */
  code: ErrorCode;
  /** A detailed, technical error message for logging and debugging. */
  message: string;
  /** A user-friendly message suitable for display in the UI. */
  userMessage: string;
  /** Optional object containing additional context about the error. */
  details?: Record<string, unknown>;
  /** The UNIX timestamp when the error was created. */
  readonly timestamp: number;
}

/**
 * Factory function to create a standardized `ExtensionError`.
 * @param code The `ErrorCode` for the error.
 * @param message The technical error message.
 * @param userMessage A user-friendly message.
 * @param details Optional additional context.
 * @returns A new `ExtensionError` object.
 */
export function createError(code: ErrorCode, message: string, userMessage: string, details?: Record<string, unknown>): ExtensionError {
  return Object.freeze({ code, message, userMessage, details: details ?? {}, timestamp: Date.now() });
}

/**
 * Safely converts any value thrown into a standardized `ExtensionError`.
 * This is crucial for handling errors from external libraries or unexpected runtime issues.
 * @param error The unknown value that was caught.
 * @returns A normalized `ExtensionError` object.
 */
export function normalizeError(error: unknown): ExtensionError {
  if (error && typeof error === 'object' && 'code' in error && 'userMessage' in error) {
    // It's already our custom error. Return it as is.
    return error as ExtensionError;
  }
  if (error instanceof Error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return createError(ErrorCode.NETWORK_ERROR, error.message, 'Unable to connect. Check the URL, your network, and CORS settings.', { originalStack: error.stack });
    }
    // Add more specific checks if needed
    return createError(ErrorCode.UNKNOWN_ERROR, error.message, 'An unexpected error occurred. Please try again.', { originalStack: error.stack });
  }
  return createError(ErrorCode.UNKNOWN_ERROR, 'An unknown value was thrown.', 'An unexpected error occurred.', { originalValue: String(error) });
}

/**
 * Logs an `ExtensionError` to the console in a consistent format.
 * @param error The error to log.
 * @param context An optional string to indicate where the error occurred (e.g., 'SonarrApiService').
 */
export function logError(error: ExtensionError, context?: string): void {
  const logPrefix = `[Kitsunarr Error${context ? ` | ${context}` : ''}]`;
  console.error(`${logPrefix} [${error.code}] - ${error.message}`, {
    userMessage: error.userMessage,
    details: error.details,
    timestamp: new Date(error.timestamp).toISOString(),
  });
}

/**
 * A React Error Boundary that catches rendering errors in its child component tree,
 * logs them using our standard system, and displays a fallback UI.
 */
export class ExtensionErrorBoundary extends React.Component<React.PropsWithChildren<object>, { error: ExtensionError | null }> {
  constructor(props: React.PropsWithChildren<object>) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): { error: ExtensionError } {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    const normalizedError = normalizeError(error);
    logError(normalizedError, 'ReactErrorBoundary');
    console.error('React Error Info:', errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm">
          <p className="font-bold text-red-800">Something went wrong</p>
          <p className="mt-1 text-red-700">{this.state.error.userMessage}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}