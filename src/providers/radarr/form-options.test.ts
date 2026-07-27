/** Tests for Radarr static form option metadata. */
import { describe, expect, it } from "vitest";
import { RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS } from "./form-options";

describe("Radarr form options", () => {
	it("excludes deleted from add/default minimum availability options", () => {
		expect(
			RADARR_ADD_MINIMUM_AVAILABILITY_OPTIONS_WITH_DESCRIPTIONS.map(
				(option) => option.value,
			),
		).toEqual(["tba", "announced", "inCinemas", "released"]);
	});
});
