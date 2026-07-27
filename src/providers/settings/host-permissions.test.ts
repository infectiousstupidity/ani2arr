/** Focused tests for provider host permission pattern derivation and requests. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import {
	getProviderHostPermissionPattern,
	requestProviderHostPermission,
} from "./host-permissions";

describe("getProviderHostPermissionPattern", () => {
	it.each([
		["http://localhost:8989/sonarr", "http://localhost/*"],
		["http://127.0.0.1:7878", "http://127.0.0.1/*"],
		["https://arr.example/sonarr///", "https://arr.example/*"],
		["https://arr.example:8443/radarr", "https://arr.example/*"],
		["https://sonarr.example.com", "https://sonarr.example.com/*"],
		["https://radarr.example.com", "https://radarr.example.com/*"],
	])("maps %s to %s", (url, pattern) => {
		expect(getProviderHostPermissionPattern(url)).toEqual({
			ok: true,
			value: pattern,
		});
	});
});

describe("requestProviderHostPermission", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("requests host permission for the normalized scheme and host pattern", async () => {
		const requestSpy = vi
			.spyOn(browser.permissions, "request")
			.mockResolvedValue(true as never);

		const result = await requestProviderHostPermission(
			"https://sonarr.example:8989",
		);

		expect(result).toEqual({
			ok: true,
			value: {
				pattern: "https://sonarr.example/*",
				granted: true,
			},
		});
		expect(requestSpy).toHaveBeenCalledTimes(1);
		expect(requestSpy).toHaveBeenCalledWith({
			origins: ["https://sonarr.example/*"],
		});
	});

	it("reuses an in-flight permission request for the same scheme and host", async () => {
		let resolveRequest: ((value: boolean) => void) | undefined;

		const requestSpy = vi
			.spyOn(browser.permissions, "request")
			.mockImplementation(
				() =>
					new Promise<boolean>((resolve) => {
						resolveRequest = resolve;
					}),
			);

		const first = requestProviderHostPermission(
			"https://arr.example:7878/sonarr",
		);
		const second = requestProviderHostPermission(
			"https://arr.example:8989/radarr",
		);

		expect(requestSpy).toHaveBeenCalledTimes(1);

		resolveRequest?.(true);

		const expected = {
			ok: true,
			value: { pattern: "https://arr.example/*", granted: true },
		};
		await expect(Promise.all([first, second])).resolves.toEqual([
			expected,
			expected,
		]);
		expect(requestSpy).toHaveBeenCalledTimes(1);
	});
});
