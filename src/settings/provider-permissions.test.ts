/* eslint-disable unicorn/prefer-https */

import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { createDefaultExtensionOptions } from "./schema";
import {
	cleanupUnusedProviderHostPermission,
	removeSeerrCsrfCookiePermission,
	requestSeerrCsrfCookiePermission,
} from "./provider-permissions";

describe("cleanupUnusedProviderHostPermission", () => {
	it("keeps permission when another provider still uses the same scheme and host", async () => {
		const removeSpy = vi.spyOn(browser.permissions, "remove");
		const settings = createDefaultExtensionOptions();
		settings.providers.radarr.url = "http://arr.local:7878/radarr";

		await cleanupUnusedProviderHostPermission(
			"http://arr.local:8989/sonarr",
			settings,
		);

		expect(removeSpy).not.toHaveBeenCalled();
	});

	it("removes permission when no provider still uses the same scheme and host", async () => {
		const removeSpy = vi
			.spyOn(browser.permissions, "remove")
			.mockResolvedValue(true as never);
		const settings = createDefaultExtensionOptions();
		settings.providers.radarr.url = "https://radarr.example/radarr";

		await cleanupUnusedProviderHostPermission(
			"http://arr.local:8989/sonarr",
			settings,
		);

		expect(removeSpy).toHaveBeenCalledWith({
			origins: ["http://arr.local/*"],
		});
	});
});

describe("requestSeerrCsrfCookiePermission", () => {
	it("requests optional cookie access", async () => {
		const request = vi
			.spyOn(browser.permissions, "request")
			.mockResolvedValue(true as never);

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

describe("removeSeerrCsrfCookiePermission", () => {
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
