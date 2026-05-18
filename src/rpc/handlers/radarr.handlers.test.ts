/** Tests for Radarr RPC handler resource loading. */
// src/rpc/handlers/radarr.handlers.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	type ProviderCredentials,
} from "@/providers";
import type { ApiHandlerDeps } from "./handler-deps";
import { createRadarrHandlers } from "./radarr.handlers";

const credentials: ProviderCredentials = {
	url: "https://radarr.example",
	apiKey: "secret",
};

describe("createRadarrHandlers", () => {
	it("loads Radarr form resources through the Radarr client", async () => {
		const qualityProfiles = [
			{ id: parseProviderQualityProfileId(1), name: "HD" },
		];
		const rootFolders = [{ id: 2, path: "/movies", freeSpace: 100 }];
		const tags = [{ id: parseProviderTagId(3), label: "anime" }];
		const radarrClient = {
			getQualityProfiles: vi.fn(async () => qualityProfiles),
			getRootFolders: vi.fn(async () => rootFolders),
			getTags: vi.fn(async () => tags),
		};

		const handlers = createRadarrHandlers({
			radarrClient,
			providerConfig: {
				requireCredentials: vi.fn(),
			},
		} as unknown as ApiHandlerDeps);

		await expect(
			handlers.getRadarrFormResources({ credentials }),
		).resolves.toEqual({
			qualityProfiles,
			rootFolders,
			tags,
		});

		expect(radarrClient.getQualityProfiles).toHaveBeenCalledWith(credentials);
		expect(radarrClient.getRootFolders).toHaveBeenCalledWith(credentials);
		expect(radarrClient.getTags).toHaveBeenCalledWith(credentials);
	});
});
