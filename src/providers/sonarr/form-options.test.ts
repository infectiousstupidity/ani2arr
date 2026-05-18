/** Tests for Sonarr static form option metadata. */
// src/providers/sonarr/form-options.test.ts

import { describe, expect, it } from "vitest";
import {
	SONARR_EDIT_MONITORING_ACTIONS,
	SONARR_MONITOR_OPTIONS,
} from "./schemas";
import {
	SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS,
	SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS,
} from "./form-options";

describe("Sonarr form options", () => {
	it("provides monitor metadata for each Sonarr monitor option", () => {
		expect(
			SONARR_MONITOR_OPTIONS_WITH_DESCRIPTIONS.map((option) => option.value),
		).toEqual(SONARR_MONITOR_OPTIONS);
	});

	it("includes the no-change edit monitoring action", () => {
		expect(
			SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS.map(
				(option) => option.value,
			),
		).toEqual(SONARR_EDIT_MONITORING_ACTIONS);
		expect(
			SONARR_EDIT_MONITORING_ACTION_OPTIONS_WITH_DESCRIPTIONS[0],
		).toMatchObject({
			value: "noChange",
			label: "No Change",
		});
	});
});
