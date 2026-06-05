/** Tests for media-modal helper behavior that affects provider URL exposure. */
// src/features/media-modal/helpers.test.ts

import { describe, expect, it } from "vitest";
import { pickProviderPoster } from "./helpers";

describe("pickProviderPoster", () => {
	it("keeps public remote posters and ignores provider-relative poster paths", () => {
		expect(
			pickProviderPoster({
				images: [{ coverType: "poster", url: "/MediaCover/1/poster.jpg" }],
			}),
		).toBeUndefined();

		expect(
			pickProviderPoster({
				images: [
					{
						coverType: "poster",
						url: "/MediaCover/1/poster.jpg",
						remoteUrl: "https://image.example/poster.jpg",
					},
				],
			}),
		).toBe("https://image.example/poster.jpg");

		expect(
			pickProviderPoster({
				remotePoster: "https://image.example/fallback.jpg",
			}),
		).toBe("https://image.example/fallback.jpg");
	});
});
