/** Tests for shared provider RPC connection handler routing. */
// src/rpc/handlers/provider.handlers.test.ts

import { describe, expect, it, vi } from "vitest";
import type { ProviderCredentials } from "@/providers";
import { providerHandlers } from "./provider.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};

const sonarrClientMock = vi.hoisted(() => ({
	testConnection: vi.fn(),
}));

const radarrClientMock = vi.hoisted(() => ({
	testConnection: vi.fn(),
}));

vi.mock("@/background/api/api-services", () => ({
	radarrClient: radarrClientMock,
	sonarrClient: sonarrClientMock,
}));

describe("providerHandlers", () => {
	it("tests Sonarr connections through the current Sonarr client", async () => {
		sonarrClientMock.testConnection.mockResolvedValue({ version: "4.0.1" });

		await expect(
			providerHandlers.testProviderConnection({
				provider: "sonarr",
				credentials,
			}),
		).resolves.toEqual({ version: "4.0.1" });

		expect(sonarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
		expect(radarrClientMock.testConnection).not.toHaveBeenCalled();
	});
});
