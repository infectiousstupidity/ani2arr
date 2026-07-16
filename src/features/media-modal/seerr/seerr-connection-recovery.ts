/** Pure Seerr modal recovery-action derivation from connection errors. */
// src/features/media-modal/seerr/seerr-connection-recovery.ts

import {
	ErrorCode,
	type ExtensionError,
} from "@/shared/errors/error.types";

export type SeerrConnectionRecoveryAction =
	| "configure"
	| "reconnect"
	| "csrf"
	| "settings";

const RECONNECT_ERROR_CODES = new Set<ErrorCode>([
	ErrorCode.SEERR_AUTH_REQUIRED,
	ErrorCode.SEERR_ACCOUNT_CHANGED,
	ErrorCode.SEERR_SESSION_UNAVAILABLE,
]);

const SETTINGS_ERROR_CODES = new Set<ErrorCode>([
	ErrorCode.CONFIGURATION_ERROR,
	ErrorCode.PERMISSION_ERROR,
]);

export function getSeerrConnectionRecoveryAction(input: {
	isConfigured: boolean;
	errors: readonly (ExtensionError | null | undefined)[];
}): SeerrConnectionRecoveryAction | null {
	if (!input.isConfigured) return "configure";

	for (const error of input.errors) {
		if (error && RECONNECT_ERROR_CODES.has(error.code)) return "reconnect";
	}
	for (const error of input.errors) {
		if (error?.code === ErrorCode.SEERR_CSRF_REQUIRED) return "csrf";
	}
	for (const error of input.errors) {
		if (error && SETTINGS_ERROR_CODES.has(error.code)) return "settings";
	}
	return null;
}

export function getSeerrConnectionRecoveryLabel(
	action: SeerrConnectionRecoveryAction,
): string {
	if (action === "configure") return "Configure Seerr";
	if (action === "reconnect") return "Reconnect Seerr";
	if (action === "csrf") return "Enable CSRF support";
	return "Open Seerr settings";
}
