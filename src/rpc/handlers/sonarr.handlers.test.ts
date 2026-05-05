/** Tests for Sonarr RPC handler wiring that is easy to regress during client migration. */
// src/rpc/handlers/sonarr.handlers.test.ts

import { describe, expect, it, vi } from "vitest";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	type ProviderCredentials,
} from "@/providers";
import type { ApiHandlerDeps } from "./handler-deps";
import { createSonarrHandlers } from "./sonarr.handlers";

const credentials: ProviderCredentials = {
	url: "https://sonarr.example",
	apiKey: "secret",
};

describe("createSonarrHandlers", () => {
	it("loads Sonarr form options through the current Sonarr client", async () => {
		const qualityProfiles = [
			{ id: parseProviderQualityProfileId(1), name: "HD" },
		];
		const rootFolders = [{ id: 2, path: "/anime", freeSpace: 100 }];
		const tags = [{ id: parseProviderTagId(3), label: "anime" }];
		const sonarrClient = {
			getQualityProfiles: vi.fn(async () => qualityProfiles),
			getRootFolders: vi.fn(async () => rootFolders),
			getTags: vi.fn(async () => tags),
		};
		const legacySonarrClient = {
			getQualityProfiles: vi.fn(),
			getRootFolders: vi.fn(),
			getTags: vi.fn(),
		};

		const handlers = createSonarrHandlers({
			sonarrClient,
			SonarrClient: legacySonarrClient,
			providerConfig: {
				requireCredentials: vi.fn(),
			},
		} as unknown as ApiHandlerDeps);

		await expect(
			handlers.getSonarrFormOptions({ credentials }),
		).resolves.toEqual({
			qualityProfiles,
			rootFolders,
			tags,
		});

		expect(sonarrClient.getQualityProfiles).toHaveBeenCalledWith(credentials);
		expect(sonarrClient.getRootFolders).toHaveBeenCalledWith(credentials);
		expect(sonarrClient.getTags).toHaveBeenCalledWith(credentials);
		expect(legacySonarrClient.getQualityProfiles).not.toHaveBeenCalled();
		expect(legacySonarrClient.getRootFolders).not.toHaveBeenCalled();
		expect(legacySonarrClient.getTags).not.toHaveBeenCalled();
	});
});
