/** Tests for Seerr request-modal recovery controls. */

import { describe, expect, it } from "vitest";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import { getSeerrConnectionRecovery } from "./seerr-connection-recovery";

function error(code: ErrorCode) {
	return createError(code, code, code);
}

describe("Seerr connection recovery", () => {
	it("offers configuration when Seerr is disconnected", () => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: false,
				authMode: null,
				errors: [],
			}),
		).toEqual({ label: "Configure Seerr", enableCsrf: false });
	});

	it.each([
		ErrorCode.SEERR_AUTH_REQUIRED,
		ErrorCode.SEERR_ACCOUNT_CHANGED,
		ErrorCode.SEERR_SESSION_UNAVAILABLE,
	])("offers reconnect for %s", (code) => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: "session",
				errors: [error(code)],
			}),
		).toEqual({ label: "Reconnect Seerr", enableCsrf: false });
	});

	it.each([
		ErrorCode.CONFIGURATION_ERROR,
		ErrorCode.PERMISSION_ERROR,
	])("opens settings for %s", (code) => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: "session",
				errors: [error(code)],
			}),
		).toEqual({ label: "Open Seerr settings", enableCsrf: false });
	});

	it("uses the optional-permission route for session CSRF errors", () => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: "session",
				errors: [error(ErrorCode.SEERR_CSRF_REQUIRED)],
			}),
		).toEqual({ label: "Enable CSRF support", enableCsrf: true });
	});

	it("offers a session switch for API-key CSRF errors", () => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: "apiKey",
				errors: [error(ErrorCode.SEERR_CSRF_REQUIRED)],
			}),
		).toEqual({ label: "Switch to browser session", enableCsrf: false });
	});

	it("keeps reconnect priority when more than one error exists", () => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: "session",
				errors: [
					error(ErrorCode.SEERR_CSRF_REQUIRED),
					error(ErrorCode.SEERR_AUTH_REQUIRED),
				],
			}),
		).toEqual({ label: "Reconnect Seerr", enableCsrf: false });
	});

	it("opens settings when CSRF auth mode is unavailable", () => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: null,
				errors: [error(ErrorCode.SEERR_CSRF_REQUIRED)],
			}),
		).toEqual({ label: "Open Seerr settings", enableCsrf: false });
	});

	it.each([
		ErrorCode.SEERR_PERMISSION_DENIED,
		ErrorCode.SEERR_QUOTA_EXCEEDED,
		ErrorCode.API_ERROR,
	])("does not mislabel provider result %s as connection recovery", (code) => {
		expect(
			getSeerrConnectionRecovery({
				isConfigured: true,
				authMode: "session",
				errors: [error(code)],
			}),
		).toBeNull();
	});
});
