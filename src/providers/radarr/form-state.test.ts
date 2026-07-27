/** Tests for Radarr add-default normalization. */
import { describe, expect, it } from "vitest";
import {
	createDefaultRadarrFormState,
	normalizeRadarrDefaults,
	normalizeRadarrFormState,
	stripRadarrFormStateForDefaults,
} from "./form-state";

describe("Radarr form state", () => {
	it("creates complete add defaults without movie-level monitored", () => {
		expect(
			stripRadarrFormStateForDefaults(createDefaultRadarrFormState()),
		).toEqual({
			minimumAvailability: "released",
			freeformTags: [],
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		});
	});

	it("preserves default fields and strips movie-level monitored", () => {
		expect(
			stripRadarrFormStateForDefaults({
				monitored: false,
				freeformTags: ["ani2arr", "seasonal"],
				minimumAvailability: "announced",
				addOptions: {
					monitor: "movieAndCollection",
					searchForMovie: false,
				},
			}),
		).toEqual({
			freeformTags: ["ani2arr", "seasonal"],
			minimumAvailability: "announced",
			addOptions: {
				monitor: "movieAndCollection",
				searchForMovie: false,
			},
		});
	});

	it("fills missing add defaults without replacing explicit values", () => {
		expect(
			normalizeRadarrDefaults({
				addOptions: {
					monitor: "none",
					searchForMovie: false,
				},
			}),
		).toEqual({
			minimumAvailability: "released",
			freeformTags: [],
			addOptions: {
				monitor: "none",
				searchForMovie: false,
			},
		});
	});

	it("keeps generic form normalization free of add defaults", () => {
		expect(normalizeRadarrFormState({})).toEqual({
			freeformTags: [],
		});
	});
});
