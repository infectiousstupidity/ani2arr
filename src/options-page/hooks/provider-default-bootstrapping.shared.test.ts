/** Tests default option bootstrapping from provider form metadata. */
// src/options-page/hooks/provider-default-bootstrapping.shared.test.ts

import { describe, expect, it } from "vitest";
import { parseProviderQualityProfileId } from "@/providers";
import {
	bootstrapRadarrDefaults,
	bootstrapSonarrDefaults,
} from "./provider-default-bootstrapping.shared";

const formOptions = {
	qualityProfiles: [
		{ id: parseProviderQualityProfileId(10), name: "Default Profile" },
	],
	rootFolders: [{ id: 1, path: "/media/library", freeSpace: 123 }],
	tags: [],
};

describe("provider default bootstrapping", () => {
	it("fills missing Sonarr defaults from provider form options", () => {
		expect(bootstrapSonarrDefaults(undefined, formOptions)).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(10),
			rootFolderPath: "/media/library",
			seriesType: "anime",
			seasonFolder: true,
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		});
	});

	it("does not overwrite explicit Radarr defaults", () => {
		expect(
			bootstrapRadarrDefaults(
				{
					qualityProfileId: parseProviderQualityProfileId(99),
					rootFolderPath: "/custom/root",
					addOptions: {
						monitor: "movieAndCollection",
					},
				},
				formOptions,
			),
		).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(99),
			rootFolderPath: "/custom/root",
			addOptions: {
				monitor: "movieAndCollection",
				searchForMovie: true,
			},
		});
	});

	it("preserves explicit Sonarr choices while filling the remaining defaults", () => {
		expect(
			bootstrapSonarrDefaults(
				{
					seriesType: "standard",
					addOptions: {
						monitor: "future",
						searchForMissingEpisodes: false,
					},
				},
				formOptions,
			),
		).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(10),
			rootFolderPath: "/media/library",
			seriesType: "standard",
			seasonFolder: true,
			addOptions: {
				monitor: "future",
				searchForMissingEpisodes: false,
				searchForCutoffUnmetEpisodes: false,
			},
		});
	});

	it("fills missing Radarr defaults with baseline selections", () => {
		expect(bootstrapRadarrDefaults(undefined, formOptions)).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(10),
			rootFolderPath: "/media/library",
			minimumAvailability: "released",
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		});
	});
});
