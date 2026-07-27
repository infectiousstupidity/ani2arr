/** Tests for Sonarr add-default normalization. */
import { describe, expect, it } from "vitest";
import {
	createDefaultSonarrFormState,
	normalizeSonarrDefaults,
	normalizeSonarrFormState,
	stripSonarrFormStateForDefaults,
} from "./form-state";

describe("Sonarr form state", () => {
	it("creates complete add defaults", () => {
		expect(
			stripSonarrFormStateForDefaults(createDefaultSonarrFormState()),
		).toEqual({
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

	it("keeps default fields and strips form-only fields", () => {
		expect(
			stripSonarrFormStateForDefaults({
				freeformTags: ["ani2arr", "seasonal"],
				monitorNewItems: "none",
			}),
		).toEqual({
			freeformTags: ["ani2arr", "seasonal"],
		});
	});

	it("fills missing add defaults without replacing explicit values", () => {
		expect(
			normalizeSonarrDefaults({
				seriesType: "standard",
				seasonFolder: false,
				addOptions: {
					monitor: "future",
					searchForMissingEpisodes: false,
					searchForCutoffUnmetEpisodes: true,
				},
			}),
		).toEqual({
			seriesType: "standard",
			seasonFolder: false,
			freeformTags: [],
			addOptions: {
				monitor: "future",
				searchForMissingEpisodes: false,
				searchForCutoffUnmetEpisodes: true,
			},
		});
	});

	it("keeps generic form normalization free of add defaults", () => {
		expect(normalizeSonarrFormState({})).toEqual({
			freeformTags: [],
		});
	});
});
