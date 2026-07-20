/** Tests for visible Seerr session controls. */

import { describe, expect, it } from "vitest";
import type { SeerrConnection } from "@/providers/seerr/types";
import { ErrorCode } from "@/shared/errors/error.types";
import { getSeerrSessionControl } from "./seerr-connection-state";

const sessionConnection: SeerrConnection = {
	url: "https://seerr.example",
	auth: { mode: "session" },
	account: { id: 1, displayName: "Alice" },
};

function control(input: {
	connection?: SeerrConnection | null;
	isConnecting?: boolean;
	errorCode?: ErrorCode | null;
	hasUrlChanges?: boolean;
}) {
	return getSeerrSessionControl({
		connection: input.connection ?? null,
		isConnecting: input.isConnecting ?? false,
		errorCode: input.errorCode ?? null,
		hasUrlChanges: input.hasUrlChanges ?? false,
	});
}

describe("Seerr connection controls", () => {
	it("gives checking state precedence", () => {
		expect(
			control({
				connection: sessionConnection,
				isConnecting: true,
				errorCode: ErrorCode.SEERR_ACCOUNT_CHANGED,
			}),
		).toEqual({ buttonLabel: "Checking...", showLoginActions: false });
	});

	it("uses explicit account-change confirmation", () => {
		expect(
			control({
				connection: sessionConnection,
				errorCode: ErrorCode.SEERR_ACCOUNT_CHANGED,
			}),
		).toEqual({
			buttonLabel: "Use current Seerr account",
			showLoginActions: true,
		});
	});

	it.each([
		ErrorCode.SEERR_AUTH_REQUIRED,
		ErrorCode.SEERR_SESSION_UNAVAILABLE,
	])("shows login actions for %s", (errorCode) => {
		expect(control({ connection: sessionConnection, errorCode })).toEqual({
			buttonLabel: "I have signed in — check again",
			showLoginActions: true,
		});
	});

	it("distinguishes stable sessions from new or changed URLs", () => {
		expect(control({ connection: sessionConnection })).toEqual({
			buttonLabel: "Re-check account",
			showLoginActions: false,
		});
		expect(control({ connection: sessionConnection, hasUrlChanges: true })).toEqual({
			buttonLabel: "Check Seerr session",
			showLoginActions: false,
		});
		expect(control({ connection: null })).toEqual({
			buttonLabel: "Check Seerr session",
			showLoginActions: false,
		});
	});
});
