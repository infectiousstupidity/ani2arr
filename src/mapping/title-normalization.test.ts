import { describe, expect, it } from "vitest";
import {
	canonicalTitleKeyForProvider,
	sanitizeLookupDisplayForProvider,
} from "./title-normalization";

describe("title normalization", () => {
	it("sanitizes Sonarr lookup titles with suffix-only season cleanup", () => {
		expect(
			sanitizeLookupDisplayForProvider("sonarr", "[Oshi no Ko] 3rd Season"),
		).toBe("Oshi no Ko");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Attack on Titan Final Season",
			),
		).toBe("Attack on Titan");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Bleach: Thousand-Year Blood War Part 2",
			),
		).toBe("Bleach: Thousand-Year Blood War");
		expect(sanitizeLookupDisplayForProvider("sonarr", "Some Show Cour II")).toBe(
			"Some Show",
		);
		expect(sanitizeLookupDisplayForProvider("sonarr", "Some Show S2")).toBe(
			"Some Show",
		);
	});

	it("does not strip non-suffix title words from Sonarr lookup titles", () => {
		expect(sanitizeLookupDisplayForProvider("sonarr", "Final Space")).toBe(
			"Final Space",
		);
		expect(sanitizeLookupDisplayForProvider("sonarr", "The Final")).toBe(
			"The Final",
		);
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"A Certain Scientific Railgun T",
			),
		).toBe("A Certain Scientific Railgun T");
		expect(
			sanitizeLookupDisplayForProvider(
				"sonarr",
				"Some Title Part of Something",
			),
		).toBe("Some Title Part of Something");
	});

	it("sanitizes Radarr lookup titles without Sonarr season cleanup", () => {
		expect(sanitizeLookupDisplayForProvider("radarr", "Movie Title (2024)")).toBe(
			"Movie Title",
		);
		expect(sanitizeLookupDisplayForProvider("radarr", "[Movie Title]")).toBe(
			"Movie Title",
		);
	});

	it("builds canonical provider title keys from sanitized titles", () => {
		expect(canonicalTitleKeyForProvider("sonarr", "One-Punch Man")).toBe(
			"one punch man",
		);
		expect(canonicalTitleKeyForProvider("sonarr", "GATE (2015)")).toBe(
			"gate",
		);
		expect(
			canonicalTitleKeyForProvider("sonarr", "Attack on Titan Final Season"),
		).toBe("attack on titan");
	});
});
