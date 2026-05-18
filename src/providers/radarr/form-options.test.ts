/** Tests for Radarr static form option metadata. */
// src/providers/radarr/form-options.test.ts

import { describe, expect, it } from "vitest";
import { RADARR_MINIMUM_AVAILABILITY_OPTIONS } from "./schemas";
import {
	RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS,
	RADARR_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS,
} from "./form-options";

describe("Radarr form options", () => {
	it("provides minimum availability metadata for each provider value", () => {
		expect(
			RADARR_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS.map(
				(option) => option.value,
			),
		).toEqual(RADARR_MINIMUM_AVAILABILITY_OPTIONS);
	});

	it("excludes deleted from add/default minimum availability options", () => {
		expect(
			RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS.map(
				(option) => option.value,
			),
		).toEqual(["tba", "announced", "inCinemas", "released"]);
	});
});
