/** Tests for Radarr tag normalization and save-time ID resolution. */
// src/providers/radarr/tags.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseProviderTagId } from "@/providers";
import { resolveRadarrTagIds } from "./tags";

const credentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};

describe("resolveRadarrTagIds", () => {
	it("reuses existing tag labels, creates missing labels once, and dedupes ids", async () => {
		const api = {
			getTags: vi.fn(async () => [
				{ id: parseProviderTagId(7), label: "Keep" },
				{ id: parseProviderTagId(8), label: "new-tag" },
			]),
			createTag: vi.fn(async () => ({
				id: parseProviderTagId(9),
				label: "fresh-tag",
			})),
		};

		const result = await resolveRadarrTagIds({
			api,
			credentials,
			existingIdsFromForm: [parseProviderTagId(7), parseProviderTagId(7)],
			freeformLabelsFromForm: [" keep ", "Fresh Tag", "fresh   tag"],
		});

		expect(result).toEqual([parseProviderTagId(7), parseProviderTagId(9)]);
		expect(api.createTag).toHaveBeenCalledTimes(1);
		expect(api.createTag).toHaveBeenCalledWith("fresh-tag", credentials);
	});

	it("rejects invalid Radarr tag labels before creating tags", async () => {
		const api = {
			getTags: vi.fn(async () => []),
			createTag: vi.fn(),
		};

		await expect(
			resolveRadarrTagIds({
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
