/** Tests for provider RPC connection handlers. */
// src/rpc/handlers/provider.handlers.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderCredentials } from "@/providers/types";
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

vi.mock("@/background/api-services", () => ({
	radarrClient: radarrClientMock,
	sonarrClient: sonarrClientMock,
}));

describe("providerHandlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("tests Sonarr connections through the current Sonarr client", async () => {
		sonarrClientMock.testConnection.mockResolvedValue({ version: "4.0.1" });

		await expect(
			providerHandlers.testSonarrConnection({
				credentials,
			}),
		).resolves.toEqual({ version: "4.0.1" });

		expect(sonarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
		expect(radarrClientMock.testConnection).not.toHaveBeenCalled();
	});

	it("tests Radarr connections through the current Radarr client", async () => {
		radarrClientMock.testConnection.mockResolvedValue({ version: "5.0.1" });

		await expect(
			providerHandlers.testRadarrConnection({
				credentials,
			}),
		).resolves.toEqual({ version: "5.0.1" });

		expect(radarrClientMock.testConnection).toHaveBeenCalledWith(credentials);
		expect(sonarrClientMock.testConnection).not.toHaveBeenCalled();
	});
});
