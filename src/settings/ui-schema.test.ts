/** Focused tests for the options-owned UI schema behavior. */
// src/settings/ui-schema.test.ts

import { describe, expect, it } from "vitest";
import {
	createDefaultExtensionOptions,
	createDefaultUiOptions,
	parseExtensionOptions,
} from "@/settings";

describe("parseExtensionOptions ui schema", () => {
	it("keeps current UI settings shape", () => {
		const settings = createDefaultExtensionOptions();
		settings.ui.preferredAniListTitleLanguage = "romaji";
		settings.ui.browseCards.sonarr.visibility = "hover";
		settings.ui.animePages.radarr.enabled = false;

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
