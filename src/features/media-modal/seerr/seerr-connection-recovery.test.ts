/** Tests for Seerr request-modal recovery actions. */
// src/features/media-modal/seerr/seerr-connection-recovery.test.ts

import { describe, expect, it } from "vitest";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import {
	getSeerrConnectionRecoveryAction,
	getSeerrConnectionRecoveryLabel,
} from "./seerr-connection-recovery";

function error(code: ErrorCode) {
	return createError(code, code, code);
}

describe("Seerr connection recovery", () => {
	it("offers configuration when Seerr is disconnected", () => {
		const action = getSeerrConnectionRecoveryAction({
			isConfigured: false,
			authMode: null,
			errors: [],
		});

		expect(action).toBe("configure");
		expect(getSeerrConnectionRecoveryLabel(action!)).toBe("Configure Seerr");
	});

	it.each([
		ErrorCode.SEERR_AUTH_REQUIRED,
		ErrorCode.SEERR_ACCOUNT_CHANGED,
		ErrorCode.SEERR_SESSION_UNAVAILABLE,
	])("offers reconnect for %s", (code) => {
		const action = getSeerrConnectionRecoveryAction({
			isConfigured: true,
			authMode: "session",
			errors: [error(code)],
		});

		expect(action).toBe("reconnect");
		expect(getSeerrConnectionRecoveryLabel(action!)).toBe("Reconnect Seerr");
	});

	it.each([
		ErrorCode.CONFIGURATION_ERROR,
		ErrorCode.PERMISSION_ERROR,
	])("opens settings for %s", (code) => {
		const action = getSeerrConnectionRecoveryAction({
			isConfigured: true,
			authMode: "session",
			errors: [error(code)],
		});

		expect(action).toBe("settings");
		expect(getSeerrConnectionRecoveryLabel(action!)).toBe(
			"Open Seerr settings",
		);
	});

	it("offers the explicit optional-permission flow after a CSRF rejection", () => {
		const action = getSeerrConnectionRecoveryAction({
			isConfigured: true,
			authMode: "session",
			errors: [error(ErrorCode.SEERR_CSRF_REQUIRED)],
		});

		expect(action).toBe("csrf");
		expect(getSeerrConnectionRecoveryLabel(action!)).toBe(
			"Enable CSRF support",
		);
	});

	it("switches API-key connections to browser-session auth after CSRF rejection", () => {
		const action = getSeerrConnectionRecoveryAction({
			isConfigured: true,
			authMode: "apiKey",
			errors: [error(ErrorCode.SEERR_CSRF_REQUIRED)],
		});

		expect(action).toBe("switch-to-session");
		expect(getSeerrConnectionRecoveryLabel(action!)).toBe(
			"Switch to browser session",
		);
	});

	it("falls back to settings when configured auth mode is unavailable", () => {
		expect(
			getSeerrConnectionRecoveryAction({
				isConfigured: true,
				authMode: null,
				errors: [error(ErrorCode.SEERR_CSRF_REQUIRED)],
			}),
		).toBe("settings");
	});

	it.each([
		ErrorCode.SEERR_PERMISSION_DENIED,
		ErrorCode.SEERR_QUOTA_EXCEEDED,
		ErrorCode.API_ERROR,
	])("does not mislabel provider result %s as a connection problem", (code) => {
		expect(
			getSeerrConnectionRecoveryAction({
				isConfigured: true,
				authMode: "session",
				errors: [error(code)],
			}),
		).toBeNull();
	});
});
