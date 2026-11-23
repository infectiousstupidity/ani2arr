/** Final visible controls for the Seerr browser-session connection form. */

import type { SeerrConnection } from "@/providers/seerr/types";
import { ErrorCode } from "@/shared/errors/error.types";

export function getSeerrSessionControl(input: {
	connection: SeerrConnection | null;
	isConnecting: boolean;
	errorCode: ErrorCode | null;
	hasUrlChanges: boolean;
}): { buttonLabel: string; showLoginActions: boolean } {
	if (input.isConnecting) {
		return { buttonLabel: "Checking...", showLoginActions: false };
	}
	if (input.errorCode === ErrorCode.SEERR_ACCOUNT_CHANGED) {
		return {
			buttonLabel: "Use current Seerr account",
			showLoginActions: true,
		};
	}
	if (
		input.errorCode === ErrorCode.SEERR_AUTH_REQUIRED ||
		input.errorCode === ErrorCode.SEERR_SESSION_UNAVAILABLE
	) {
		return {
			buttonLabel: "I have signed in — check again",
			showLoginActions: true,
		};
	}
	if (input.connection?.auth.mode === "session" && !input.hasUrlChanges) {
		return { buttonLabel: "Re-check account", showLoginActions: false };
	}
	return { buttonLabel: "Check Seerr session", showLoginActions: false };
}
