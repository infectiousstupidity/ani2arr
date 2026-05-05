/** Tests for Sonarr tag normalization and save-time ID resolution. */
// src/providers/sonarr/tags.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseProviderTagId } from "@/providers";
import { resolveSonarrTagIds } from "./tags";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};

describe("resolveSonarrTagIds", () => {
	it("reuses existing tag labels, creates missing labels once, and dedupes ids", async () => {
		const api = {
			getTags: vi.fn(async () => [
				{ id: parseProviderTagId(7), label: "Keep" },
				{ id: parseProviderTagId(8), label: "new-tag" },
			]),
			createTag: vi.fn(async () => ({ id: parseProviderTagId(9), label: "fresh-tag" })),
		};

		const result = await resolveSonarrTagIds({
			api,
			credentials,
			existingIdsFromForm: [parseProviderTagId(7)],
			freeformLabelsFromForm: [" keep ", "Fresh Tag", "fresh   tag"],
		});

		expect(result).toEqual([parseProviderTagId(7), parseProviderTagId(9)]);
		expect(api.createTag).toHaveBeenCalledTimes(1);
		expect(api.createTag).toHaveBeenCalledWith(credentials, "fresh-tag");
	});

	it("rejects invalid Sonarr tag labels before creating tags", async () => {
		const api = {
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
		};

		await expect(
			resolveSonarrTagIds({
				api,
				credentials,
				existingIdsFromForm: [],
				freeformLabelsFromForm: ["bad.tag"],
			}),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(api.createTag).not.toHaveBeenCalled();
	});
});
