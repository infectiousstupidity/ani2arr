/** Final Seerr modal recovery control derived from connection errors. */

import {
	ErrorCode,
	type ExtensionError,
} from "@/shared/errors/error.types";

export type SeerrConnectionRecovery = {
	label: string;
	enableCsrf: boolean;
};

const RECONNECT_ERROR_CODES = new Set<ErrorCode>([
	ErrorCode.SEERR_AUTH_REQUIRED,
	ErrorCode.SEERR_ACCOUNT_CHANGED,
	ErrorCode.SEERR_SESSION_UNAVAILABLE,
]);

const SETTINGS_ERROR_CODES = new Set<ErrorCode>([
	ErrorCode.CONFIGURATION_ERROR,
	ErrorCode.PERMISSION_ERROR,
]);

export function getSeerrConnectionRecovery(input: {
	isConfigured: boolean;
	authMode: "session" | "apiKey" | null;
	errors: readonly (ExtensionError | null | undefined)[];
}): SeerrConnectionRecovery | null {
	if (!input.isConfigured) {
		return { label: "Configure Seerr", enableCsrf: false };
	}

	for (const error of input.errors) {
		if (error && RECONNECT_ERROR_CODES.has(error.code)) {
			return { label: "Reconnect Seerr", enableCsrf: false };
		}
	}
	for (const error of input.errors) {
		if (error?.code !== ErrorCode.SEERR_CSRF_REQUIRED) continue;
		if (input.authMode === "session") {
			return { label: "Enable CSRF support", enableCsrf: true };
		}
		if (input.authMode === "apiKey") {
			return { label: "Switch to browser session", enableCsrf: false };
		}
		return { label: "Open Seerr settings", enableCsrf: false };
	}
	for (const error of input.errors) {
		if (error && SETTINGS_ERROR_CODES.has(error.code)) {
			return { label: "Open Seerr settings", enableCsrf: false };
		}
	}
	return null;
}
