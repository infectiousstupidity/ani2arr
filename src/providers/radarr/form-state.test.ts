/** Tests for Radarr add-default normalization. */
// src/providers/radarr/form-state.test.ts

import { describe, expect, it } from "vitest";
import {
	createDefaultRadarrFormState,
	stripRadarrFormStateForDefaults,
} from "./form-state";

describe("Radarr form state", () => {
	it("stores add defaults with monitor instead of monitored", () => {
		const defaults = createDefaultRadarrFormState();

		expect(defaults.addOptions?.monitor).toBe("movieOnly");
		expect(defaults.monitored).toBeUndefined();
		expect(stripRadarrFormStateForDefaults(defaults)).toEqual({
			minimumAvailability: "released",
			freeformTags: [],
			addOptions: {
				monitor: "movieOnly",
				searchForMovie: true,
			},
		});
	});

	it("strips movie-level monitored from add defaults", () => {
		expect(
			stripRadarrFormStateForDefaults({
				monitored: false,
				freeformTags: ["ani2arr"],
				minimumAvailability: "released",
				addOptions: {
					monitor: "none",
					searchForMovie: false,
				},
			}),
		).toEqual({
			minimumAvailability: "released",
			freeformTags: ["ani2arr"],
			addOptions: {
				monitor: "none",
				searchForMovie: false,
			},
		});
	});

	it("preserves freeform tags in add defaults", () => {
		expect(
			stripRadarrFormStateForDefaults({
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
});
