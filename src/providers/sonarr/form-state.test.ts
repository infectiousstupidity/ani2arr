/** Tests for Sonarr add-default normalization. */
// src/providers/sonarr/form-state.test.ts

import { describe, expect, it } from "vitest";
import {
	createDefaultSonarrFormState,
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
});
