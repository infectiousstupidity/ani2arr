/** Pure options-page state derivation for Seerr browser-session controls. */
// src/options-page/components/seerr-connection-state.ts

import type { SeerrConnection } from "@/providers/seerr/types";
import { ErrorCode } from "@/shared/errors/error.types";

export type SeerrSessionView =
	| "disconnected"
	| "checking"
	| "not-signed-in"
	| "connected"
	| "session-expired"
	| "session-unavailable"
	| "account-changed"
	| "api-key";

const RECONNECT_VIEWS = new Set<SeerrSessionView>([
	"not-signed-in",
	"session-expired",
	"session-unavailable",
	"account-changed",
]);

export function getSeerrSessionView(input: {
	connection: SeerrConnection | null;
	isConnecting: boolean;
	errorCode: ErrorCode | null;
}): SeerrSessionView {
	if (input.isConnecting) return "checking";
	if (input.errorCode === ErrorCode.SEERR_SESSION_UNAVAILABLE) {
		return "session-unavailable";
	}
	if (input.errorCode === ErrorCode.SEERR_ACCOUNT_CHANGED) {
		return "account-changed";
	}
	if (input.errorCode === ErrorCode.SEERR_AUTH_REQUIRED) {
		return input.connection?.auth.mode === "session"
			? "session-expired"
			: "not-signed-in";
	}
	if (input.connection?.auth.mode === "session") return "connected";
	if (input.connection?.auth.mode === "apiKey") return "api-key";
	return "disconnected";
}

export function getSeerrSessionButtonLabel(input: {
	view: SeerrSessionView;
	hasUrlChanges: boolean;
}): string {
	if (input.view === "checking") return "Checking...";
	if (input.view === "account-changed") return "Use current Seerr account";
	if (RECONNECT_VIEWS.has(input.view)) {
		return "I have signed in — check again";
	}
	if (input.view === "connected" && !input.hasUrlChanges) {
		return "Re-check account";
	}
	return "Check Seerr session";
}

export function showsSeerrLoginActions(view: SeerrSessionView): boolean {
	return RECONNECT_VIEWS.has(view);
}
