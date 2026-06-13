/** Tests for Sonarr add-default normalization. */
// src/providers/sonarr/form-state.test.ts

import { describe, expect, it } from "vitest";
import {
	createDefaultSonarrFormState,
	normalizeSonarrDefaults,
	normalizeSonarrFormState,
	stripSonarrFormStateForDefaults,
} from "./form-state";

describe("Sonarr form state", () => {
	it("stores add defaults with freeform tags", () => {
		const defaults = createDefaultSonarrFormState();

		expect(stripSonarrFormStateForDefaults(defaults)).toEqual({
			seriesType: "anime",
			seasonFolder: true,
			freeformTags: [],
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		});
	});

	it("preserves freeform tags in add defaults", () => {
		expect(
			stripSonarrFormStateForDefaults({
				freeformTags: ["ani2arr", "seasonal"],
				seriesType: "standard",
				seasonFolder: true,
				addOptions: {
					monitor: "future",
					searchForMissingEpisodes: false,
					searchForCutoffUnmetEpisodes: true,
				},
			}),
		).toEqual({
			freeformTags: ["ani2arr", "seasonal"],
			seriesType: "standard",
			seasonFolder: true,
			addOptions: {
				monitor: "future",
				searchForMissingEpisodes: false,
				searchForCutoffUnmetEpisodes: true,
			},
		});
	});

	it("fills missing add defaults without replacing explicit values", () => {
		expect(
			normalizeSonarrDefaults({
				addOptions: {
					monitor: "future",
				},
			}),
		).toMatchObject({
			seriesType: "anime",
			seasonFolder: true,
			addOptions: {
				monitor: "future",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		});

		expect(normalizeSonarrDefaults({})).toMatchObject({
			seriesType: "anime",
			seasonFolder: true,
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		});

		const defaults = normalizeSonarrDefaults({
			seriesType: "standard",
			seasonFolder: false,
			addOptions: {
				searchForMissingEpisodes: false,
				searchForCutoffUnmetEpisodes: true,
			},
		});

		expect(defaults.seriesType).toBe("standard");
		expect(defaults.seasonFolder).toBe(false);
		expect(defaults.addOptions?.searchForMissingEpisodes).toBe(false);
		expect(defaults.addOptions?.searchForCutoffUnmetEpisodes).toBe(true);
	});

	it("keeps generic form normalization free of add defaults", () => {
		expect(normalizeSonarrFormState({})).toEqual({
			freeformTags: [],
		});
	});
});
