/** Focused tests for provider host permission pattern derivation and requests. */
// src/providers/settings/host-permissions.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import {
	getProviderHostPermissionPattern,
	requestProviderHostPermission,
} from "./host-permissions";

describe("getProviderHostPermissionPattern", () => {
	it("uses the browser origin instead of the provider URL path", () => {
		expect(
			getProviderHostPermissionPattern("https://arr.example/sonarr///"),
		).toEqual({
			ok: true,
			value: "https://arr.example/*",
		});
	});

	it("treats different ports as different permission origins", () => {
		expect(
			getProviderHostPermissionPattern("http://192.168.50.166:8181"),
		).toEqual({
			ok: true,
			value: "http://192.168.50.166:8181/*",
		});
		expect(
			getProviderHostPermissionPattern("http://192.168.50.166:8282"),
		).toEqual({
			ok: true,
			value: "http://192.168.50.166:8282/*",
		});
	});

	it("treats different subdomains as different permission origins", () => {
		expect(getProviderHostPermissionPattern("https://sonarr.example.com")).toEqual(
			{
				ok: true,
				value: "https://sonarr.example.com/*",
			},
		);
		expect(getProviderHostPermissionPattern("https://radarr.example.com")).toEqual(
			{
				ok: true,
				value: "https://radarr.example.com/*",
			},
		);
	});
});

describe("requestProviderHostPermission", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("requests host permission for the normalized origin pattern", async () => {
		const requestSpy = vi
			.spyOn(browser.permissions, "request")
			.mockResolvedValue(true as never);

		const result = await requestProviderHostPermission(
			"https://sonarr.example:8989",
		);

		expect(result).toEqual({
			ok: true,
			value: {
				pattern: "https://sonarr.example:8989/*",
				granted: true,
			},
		});
		expect(requestSpy).toHaveBeenCalledTimes(1);
		expect(requestSpy).toHaveBeenCalledWith({
			origins: ["https://sonarr.example:8989/*"],
		});
	});

	it("reuses an in-flight permission request for the same origin", async () => {
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
			"https://arr.example:7878/radarr",
		);

		expect(requestSpy).toHaveBeenCalledTimes(1);

		resolveRequest?.(true);

		await expect(first).resolves.toEqual({
			ok: true,
			value: {
				pattern: "https://arr.example:7878/*",
				granted: true,
			},
		});
		await expect(second).resolves.toEqual({
			ok: true,
			value: {
				pattern: "https://arr.example:7878/*",
				granted: true,
			},
		});
		expect(requestSpy).toHaveBeenCalledTimes(1);
	});
});
