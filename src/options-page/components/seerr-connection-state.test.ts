/** Tests for Seerr options session state labels and reconnect actions. */
// src/options-page/components/seerr-connection-state.test.ts

import { describe, expect, it } from "vitest";
import type { SeerrConnection } from "@/providers/seerr/types";
import { ErrorCode } from "@/shared/errors/error.types";
import {
	getSeerrSessionButtonLabel,
	getSeerrSessionView,
	showsSeerrLoginActions,
} from "./seerr-connection-state";

const sessionConnection: SeerrConnection = {
	url: "https://seerr.example",
	auth: { mode: "session" },
	account: { id: 1, displayName: "Alice" },
};

describe("Seerr connection state", () => {
	it("distinguishes disconnected, connected, and advanced API-key modes", () => {
		expect(
			getSeerrSessionView({
				connection: null,
				isConnecting: false,
				errorCode: null,
			}),
		).toBe("disconnected");
		expect(
			getSeerrSessionView({
				connection: sessionConnection,
				isConnecting: false,
				errorCode: null,
			}),
		).toBe("connected");
		expect(
			getSeerrSessionView({
				connection: {
					url: "https://seerr.example",
					auth: { mode: "apiKey", apiKey: "secret" },
				},
				isConnecting: false,
				errorCode: null,
			}),
		).toBe("api-key");
	});

	it("distinguishes first login, expiry, and unavailable browser sessions", () => {
		const signedOut = getSeerrSessionView({
			connection: null,
			isConnecting: false,
			errorCode: ErrorCode.SEERR_AUTH_REQUIRED,
		});
		const expired = getSeerrSessionView({
			connection: sessionConnection,
			isConnecting: false,
			errorCode: ErrorCode.SEERR_AUTH_REQUIRED,
		});
		const unavailable = getSeerrSessionView({
			connection: sessionConnection,
			isConnecting: false,
			errorCode: ErrorCode.SEERR_SESSION_UNAVAILABLE,
		});

		expect(signedOut).toBe("not-signed-in");
		expect(expired).toBe("session-expired");
		expect(unavailable).toBe("session-unavailable");
		expect(showsSeerrLoginActions(signedOut)).toBe(true);
		expect(showsSeerrLoginActions(expired)).toBe(true);
		expect(showsSeerrLoginActions(unavailable)).toBe(true);
	});

	it("uses explicit check and re-check button labels", () => {
		expect(
			getSeerrSessionButtonLabel({
				view: "disconnected",
				hasUrlChanges: false,
			}),
		).toBe("Check Seerr session");
		expect(
			getSeerrSessionButtonLabel({
				view: "connected",
				hasUrlChanges: false,
			}),
		).toBe("Re-check account");
		expect(
			getSeerrSessionButtonLabel({
				view: "session-expired",
				hasUrlChanges: false,
			}),
		).toBe("I have signed in — check again");
	});
});
