import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { requestProviderHostPermission } from "./host-permissions";

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

		const first = requestProviderHostPermission("https://radarr.example:7878");
		const second = requestProviderHostPermission("https://radarr.example:7878");

		expect(requestSpy).toHaveBeenCalledTimes(1);

		resolveRequest?.(true);

		await expect(first).resolves.toEqual({
			ok: true,
			value: {
				pattern: "https://radarr.example:7878/*",
				granted: true,
			},
		});
		await expect(second).resolves.toEqual({
			ok: true,
			value: {
				pattern: "https://radarr.example:7878/*",
				granted: true,
			},
		});
		expect(requestSpy).toHaveBeenCalledTimes(1);
	});
});
