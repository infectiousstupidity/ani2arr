/** Tests for provider metadata normalization. */
// src/providers/adapters/provider-metadata.adapter.test.ts

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
	ProviderQualityProfileApiArraySchema,
	ProviderRootFolderApiArraySchema,
	ProviderTagApiArraySchema,
} from "@/providers/schemas/provider-shared.schemas";
import {
	toProviderMetadata,
	toProviderQualityProfiles,
	toProviderRootFolders,
	toProviderTags,
} from "./provider-metadata.adapter";

describe("provider metadata adapters", () => {
	it("filters root folders with null or blank paths and preserves nullable freeSpace", () => {
		const rootFolders = v.parse(ProviderRootFolderApiArraySchema, [
			{ id: 1, path: "/media/series", freeSpace: 100 },
			{ id: 2, path: null, freeSpace: null },
			{ id: 3, path: "   ", freeSpace: 200 },
			{ id: 4, path: " /media/movies ", freeSpace: null },
		]);

		expect(toProviderRootFolders(rootFolders)).toEqual([
			{ id: 1, path: "/media/series", freeSpace: 100 },
			{ id: 4, path: "/media/movies", freeSpace: null },
		]);
	});

	it("filters quality profiles with null or blank names", () => {
		const qualityProfiles = v.parse(ProviderQualityProfileApiArraySchema, [
			{ id: 1, name: "HD-1080p" },
			{ id: 2, name: null },
			{ id: 3, name: "   " },
			{ id: 4, name: " Anime " },
		]);

		expect(toProviderQualityProfiles(qualityProfiles)).toEqual([
			{ id: 1, name: "HD-1080p" },
			{ id: 4, name: "Anime" },
		]);
	});

	it("filters tags with null or blank labels", () => {
		const tags = v.parse(ProviderTagApiArraySchema, [
			{ id: 1, label: "anime" },
			{ id: 2, label: null },
			{ id: 3, label: "   " },
			{ id: 4, label: " Seasonal " },
		]);

		expect(toProviderTags(tags)).toEqual([
			{ id: 1, label: "anime" },
			{ id: 4, label: "Seasonal" },
		]);
	});

	it("normalizes all metadata groups together", () => {
		const qualityProfiles = v.parse(ProviderQualityProfileApiArraySchema, [
			{ id: 1, name: "HD" },
			{ id: 2, name: null },
		]);
		const rootFolders = v.parse(ProviderRootFolderApiArraySchema, [
			{ id: 1, path: "/media", freeSpace: null },
			{ id: 2, path: null, freeSpace: null },
		]);
		const tags = v.parse(ProviderTagApiArraySchema, [
			{ id: 1, label: "anime" },
			{ id: 2, label: "" },
		]);

		expect(toProviderMetadata({ qualityProfiles, rootFolders, tags })).toEqual({
			qualityProfiles: [{ id: 1, name: "HD" }],
			rootFolders: [{ id: 1, path: "/media", freeSpace: null }],
			tags: [{ id: 1, label: "anime" }],
		});
	});
});
