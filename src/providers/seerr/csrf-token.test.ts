/** Tests for narrowly scoped Seerr XSRF cookie access. */
// src/providers/seerr/csrf-token.test.ts

import { browser } from "wxt/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getSeerrXsrfToken,
	removeSeerrCsrfCookiePermission,
	SEERR_XSRF_COOKIE_NAME,
} from "./csrf-token";

describe("getSeerrXsrfToken", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not query cookies before optional permission is granted", async () => {
		vi.spyOn(browser.permissions, "contains").mockResolvedValue(false as never);
		const getCookie = vi.spyOn(browser.cookies, "get");

		await expect(
			getSeerrXsrfToken("https://seerr.example/base"),
		).resolves.toBeNull();
		expect(getCookie).not.toHaveBeenCalled();
	});

	it("reads only the XSRF token for the configured Seerr URL", async () => {
		vi.spyOn(browser.permissions, "contains").mockResolvedValue(true as never);
		const getCookie = vi
			.spyOn(browser.cookies, "get")
			.mockResolvedValue({ value: "token%2Fvalue" } as never);

		await expect(
			getSeerrXsrfToken("https://seerr.example:8443/base/"),
		).resolves.toBe("token/value");
		expect(getCookie).toHaveBeenCalledWith({
			url: "https://seerr.example:8443/base",
			name: SEERR_XSRF_COOKIE_NAME,
		});
	});

	it("fails closed for invalid URLs or removed permission", async () => {
		vi.spyOn(browser.permissions, "contains").mockResolvedValue(true as never);
		const getCookie = vi.spyOn(browser.cookies, "get");

		await expect(getSeerrXsrfToken("not a URL")).resolves.toBeNull();
		expect(getCookie).not.toHaveBeenCalled();
	});

	it("removes optional cookie access when session support is unused", async () => {
		const remove = vi
			.spyOn(browser.permissions, "remove")
			.mockResolvedValue(true as never);

		await removeSeerrCsrfCookiePermission();
		expect(remove).toHaveBeenCalledWith({ permissions: ["cookies"] });
	});

	it("handles permission removal that is already browser-managed", async () => {
		vi.spyOn(browser.permissions, "remove").mockRejectedValue(
			new Error("permission absent"),
		);

		await expect(removeSeerrCsrfCookiePermission()).resolves.toBeUndefined();
	});
});
