/** Tests for Sonarr static form option metadata. */
import { describe, expect, it } from "vitest";
import { SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS } from "./form-options";

describe("Sonarr form options", () => {
	it("includes the no-change edit monitoring action", () => {
		expect(
			SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS.find(
				(option) => option.value === "noChange",
			),
		).toMatchObject({
			value: "noChange",
			label: "No Change",
		});
	});
});
