import { describe, expect, it } from "vitest";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import { getSeerrConnectionRecovery } from "./seerr-connection-recovery";

function error(code: ErrorCode) {
	return createError(code, code, code);
}

function recover(
	codes: readonly ErrorCode[],
	authMode: "session" | "apiKey" | null = "session",
) {
	return getSeerrConnectionRecovery({
		isConfigured: true,
		authMode,
		errors: codes.map((code) => error(code)),
	});
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
		expect(recover([code])).toEqual({ label: "Reconnect Seerr", enableCsrf: false });
	});

	it.each([
		ErrorCode.CONFIGURATION_ERROR,
		ErrorCode.PERMISSION_ERROR,
	])("opens settings for %s", (code) => {
		expect(recover([code])).toEqual({ label: "Open Seerr settings", enableCsrf: false });
	});

	it.each([
		["session", "Enable CSRF support", true],
		["apiKey", "Switch to browser session", false],
		[null, "Open Seerr settings", false],
	] as const)("chooses CSRF recovery for %s auth mode", (authMode, label, enableCsrf) => {
		expect(recover([ErrorCode.SEERR_CSRF_REQUIRED], authMode)).toEqual({
			label,
			enableCsrf,
		});
	});

	it("keeps reconnect priority when more than one error exists", () => {
		expect(
			recover([
				ErrorCode.SEERR_CSRF_REQUIRED,
				ErrorCode.SEERR_AUTH_REQUIRED,
			]),
		).toEqual({ label: "Reconnect Seerr", enableCsrf: false });
	});

	it.each([
		ErrorCode.SEERR_PERMISSION_DENIED,
		ErrorCode.SEERR_QUOTA_EXCEEDED,
		ErrorCode.API_ERROR,
	])("does not mislabel provider result %s as connection recovery", (code) => {
		expect(recover([code])).toBeNull();
	});
});
