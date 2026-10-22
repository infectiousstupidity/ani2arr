import { describe, expect, it } from "vitest";
import { pickProviderPoster } from "./helpers";

describe("pickProviderPoster", () => {
	it.each([
		[
			"ignores provider-relative poster paths",
			{ images: [{ coverType: "poster", url: "/poster.jpg" }] },
			undefined,
		],
		[
			"uses a poster's public remote URL",
			{
				images: [
					{ coverType: "poster", remoteUrl: "https://poster.example" },
				],
			},
			"https://poster.example",
		],
		[
			"falls back to the top-level remote poster",
			{ remotePoster: "https://fallback.example" },
			"https://fallback.example",
		],
	])("%s", (_name, input, expected) => {
		expect(pickProviderPoster(input)).toBe(expected);
	});
});
