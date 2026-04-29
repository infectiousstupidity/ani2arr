/** Focused tests for the options-owned UI schema behavior. */
// src/options/ui-schema.test.ts

import { describe, expect, it } from "vitest";
import {
	createDefaultExtensionOptions,
	createDefaultUiOptions,
	parseExtensionOptions,
} from "@/options";

describe("parseExtensionOptions ui schema", () => {
	it("keeps current UI settings shape", () => {
		const settings = createDefaultExtensionOptions();
		settings.ui.browseCards.sonarr.visibility = "hover";
		settings.ui.animePages.radarr.enabled = false;
		settings.ui.schedulerDebugOverlayEnabled = true;

		expect(parseExtensionOptions(settings).ui).toEqual(settings.ui);
	});

	it("does not migrate removed legacy UI fields", () => {
		const parsed = parseExtensionOptions({
			ui: {
				browseOverlayEnabled: false,
				badgeVisibility: "hidden",
				headerInjectionEnabled: false,
			},
		});

		expect(parsed.ui).toEqual(createDefaultUiOptions());
	});
});
