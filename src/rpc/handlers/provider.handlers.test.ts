/** Tests for shared provider RPC connection handler routing. */
// src/rpc/handlers/provider.handlers.test.ts

import { describe, expect, it, vi } from "vitest";
import type { ProviderCredentials } from "@/providers";
import type { ApiHandlerDeps } from "./handler-deps";
import { createProviderHandlers } from "./provider.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};

describe("createProviderHandlers", () => {
	it("tests Sonarr connections through the current Sonarr client", async () => {
		const sonarrClient = {
			testConnection: vi.fn(async () => ({ version: "4.0.1" })),
		};
		const radarrClient = {
			testConnection: vi.fn(),
		};

		const handlers = createProviderHandlers({
			sonarrClient,
			radarrClient,
		} as unknown as ApiHandlerDeps);

		await expect(
			handlers.testProviderConnection({
				provider: "sonarr",
				credentials,
			}),
		).resolves.toEqual({ version: "4.0.1" });

		expect(sonarrClient.testConnection).toHaveBeenCalledWith(credentials);
		expect(radarrClient.testConnection).not.toHaveBeenCalled();
	});
});
