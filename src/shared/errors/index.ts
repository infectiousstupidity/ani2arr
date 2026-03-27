/** Canonical public surface for shared error codes, types, and utilities. */
// src/shared/errors/index.ts

export { ErrorCode, type ExtensionError } from './error.types';
export { createError, logError, normalizeError } from './error-utils';
