/** Tests for explicit Seerr CSRF optional-permission actions. */
// src/options-page/hooks/seerr-csrf-permission.test.ts

import { browser } from "wxt/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestSeerrCsrfCookiePermission } from "./seerr-csrf-permission";

describe("Seerr CSRF cookie permission", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("requests cookie access only when the explicit action runs", async () => {
		const request = vi
			.spyOn(browser.permissions, "request")
			.mockResolvedValue(true as never);

		expect(request).not.toHaveBeenCalled();
		await expect(requestSeerrCsrfCookiePermission()).resolves.toBe(true);
		expect(request).toHaveBeenCalledWith({ permissions: ["cookies"] });
	});

	it("handles denied or failed permission prompts", async () => {
		const request = vi.spyOn(browser.permissions, "request");
		request.mockResolvedValueOnce(false as never);
		await expect(requestSeerrCsrfCookiePermission()).resolves.toBe(false);

		request.mockRejectedValueOnce(new Error("permission API unavailable"));
		await expect(requestSeerrCsrfCookiePermission()).resolves.toBe(false);
	});
});
