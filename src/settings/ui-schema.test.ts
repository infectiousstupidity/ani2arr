import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { PublicOptionsSchema } from "@/settings/schema";
import { createDefaultUiOptions } from "@/settings/ui-schema";

describe("public options UI schema", () => {
	it("keeps current UI settings shape", () => {
		const ui = createDefaultUiOptions();
		ui.preferredAniListTitleLanguage = "romaji";
		ui.browseCards.sonarr.visibility = "hover";
		ui.animePages.radarr.enabled = false;

		expect(v.parse(PublicOptionsSchema, { ui }).ui).toEqual(ui);
	});

	it("does not migrate removed legacy UI fields", () => {
		const parsed = v.parse(PublicOptionsSchema, {
			ui: {
				browseOverlayEnabled: false,
			},
		});

		expect(parsed.ui).toEqual(createDefaultUiOptions());
	});
});
