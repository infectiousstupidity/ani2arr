/** Tests for settings-owned provider permission cleanup behavior. */
// src/settings/provider-permissions.test.ts

/* eslint-disable unicorn/prefer-https */

import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { createDefaultExtensionOptions } from "./schema";
import {
	cleanupUnusedProviderHostPermission,
	removeSeerrCsrfCookiePermission,
} from "./provider-permissions";

describe("cleanupUnusedProviderHostPermission", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

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

describe("removeSeerrCsrfCookiePermission", () => {
	afterEach(() => {
		vi.restoreAllMocks();
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
