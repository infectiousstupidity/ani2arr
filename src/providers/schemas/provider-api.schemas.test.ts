/** Tests for focused provider API DTO schemas. */
// src/providers/schemas/provider-api.schemas.test.ts

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
	ProviderQualityProfileApiSchema,
	ProviderRootFolderApiSchema,
	ProviderSystemStatusApiSchema,
	ProviderTagApiSchema,
} from "./provider-shared.schemas";
import { RadarrMovieApiSchema } from "./radarr.schemas";
import { SonarrSeriesApiSchema } from "./sonarr.schemas";

describe("provider shared API schemas", () => {
	it("accepts nullable root folder path and freeSpace bytes", () => {
		expect(
			v.parse(ProviderRootFolderApiSchema, {
				id: 1,
				path: null,
				freeSpace: null,
			}),
		).toEqual({
			id: 1,
			path: null,
			freeSpace: null,
		});

		expect(
			v.parse(ProviderRootFolderApiSchema, {
				id: 1,
				path: "/media",
				freeSpace: 123_456,
			}).freeSpace,
		).toBe(123_456);
	});

	it("accepts nullable quality profile names, tag labels, and system versions", () => {
		expect(
			v.parse(ProviderQualityProfileApiSchema, { id: 2, name: null }),
		).toEqual({
			id: 2,
			name: null,
		});
		expect(v.parse(ProviderTagApiSchema, { id: 3, label: null })).toEqual({
			id: 3,
			label: null,
		});
		expect(v.parse(ProviderSystemStatusApiSchema, { version: null })).toEqual({
			version: null,
		});
	});

	it("rejects invalid metadata IDs and invalid freeSpace values", () => {
		expect(() =>
			v.parse(ProviderQualityProfileApiSchema, { id: 0, name: "HD" }),
		).toThrow();
		expect(() =>
			v.parse(ProviderTagApiSchema, { id: 1.5, label: "anime" }),
		).toThrow();
		expect(() =>
			v.parse(ProviderRootFolderApiSchema, {
				id: 1,
				path: "/media",
				freeSpace: -1,
			}),
		).toThrow();
	});
});

describe("SonarrSeriesApiSchema", () => {
	it("brands required IDs and accepts nullable API fields", () => {
		const parsed = v.parse(SonarrSeriesApiSchema, {
			id: 10,
			title: null,
			tvdbId: 20,
			titleSlug: null,
			qualityProfileId: 30,
			rootFolderPath: null,
			tags: null,
		});

		expect(parsed.id).toBe(10);
		expect(parsed.tvdbId).toBe(20);
		expect(parsed.title).toBeNull();
		expect(parsed.titleSlug).toBeNull();
		expect(parsed.rootFolderPath).toBeNull();
		expect(parsed.tags).toBeNull();
	});

	it("rejects invalid internal, mapping, profile, and tag IDs", () => {
		const valid = {
			id: 10,
			title: "Series",
			tvdbId: 20,
			titleSlug: "series",
			qualityProfileId: 30,
			rootFolderPath: "/series",
			tags: [40],
		};

		expect(() => v.parse(SonarrSeriesApiSchema, { ...valid, id: 0 })).toThrow();
		expect(() =>
			v.parse(SonarrSeriesApiSchema, { ...valid, tvdbId: 0 }),
		).toThrow();
		expect(() =>
			v.parse(SonarrSeriesApiSchema, { ...valid, qualityProfileId: 0 }),
		).toThrow();
		expect(() =>
			v.parse(SonarrSeriesApiSchema, { ...valid, tags: [0] }),
		).toThrow();
	});
});

describe("RadarrMovieApiSchema", () => {
	it("brands required IDs and accepts nullable API fields", () => {
		const parsed = v.parse(RadarrMovieApiSchema, {
			id: 11,
			title: null,
			tmdbId: 22,
			titleSlug: null,
			qualityProfileId: 33,
			rootFolderPath: null,
			tags: null,
		});

		expect(parsed.id).toBe(11);
		expect(parsed.tmdbId).toBe(22);
		expect(parsed.title).toBeNull();
		expect(parsed.titleSlug).toBeNull();
		expect(parsed.rootFolderPath).toBeNull();
		expect(parsed.tags).toBeNull();
	});

	it("rejects invalid internal, mapping, profile, and tag IDs", () => {
		const valid = {
			id: 11,
			title: "Movie",
			tmdbId: 22,
			titleSlug: "movie",
			qualityProfileId: 33,
			rootFolderPath: "/movies",
			tags: [44],
		};

		expect(() => v.parse(RadarrMovieApiSchema, { ...valid, id: 0 })).toThrow();
		expect(() =>
			v.parse(RadarrMovieApiSchema, { ...valid, tmdbId: 0 }),
		).toThrow();
		expect(() =>
			v.parse(RadarrMovieApiSchema, { ...valid, qualityProfileId: 0 }),
		).toThrow();
		expect(() =>
			v.parse(RadarrMovieApiSchema, { ...valid, tags: [0] }),
		).toThrow();
	});
});
