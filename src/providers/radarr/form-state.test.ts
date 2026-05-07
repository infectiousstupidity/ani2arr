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
				freeformTags: [],
				minimumAvailability: "released",
				addOptions: {
					monitor: "none",
					searchForMovie: false,
				},
			}),
		).toEqual({
			minimumAvailability: "released",
			addOptions: {
				monitor: "none",
				searchForMovie: false,
			},
		});
	});
});
