/** Tests for provider mutation helper behavior. */
// src/providers/library/mutation-helpers.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseProviderQualityProfileId, parseProviderTagId } from "@/providers";
import {
	resolveMutationTagIds,
	resolveRequiredQualityProfileId,
	resolveRequiredRootFolderPath,
	shouldMoveProviderFiles,
} from "./mutation-helpers";

const qualityProfileId = parseProviderQualityProfileId;
const tagId = parseProviderTagId;

describe("provider mutation helpers", () => {
	it("resolves required provider fields and file move checks", () => {
		expect(
			resolveRequiredQualityProfileId({
				value: undefined,
				fallback: qualityProfileId(17),
				provider: "sonarr",
				entityLabel: "series",
				actionLabel: "add",
			}),
		).toBe(17);

		expect(
			resolveRequiredRootFolderPath({
				value: "  ",
				fallback: "/media/series",
				provider: "sonarr",
				entityLabel: "series",
				actionLabel: "update",
			}),
		).toBe("/media/series");

		expect(
			shouldMoveProviderFiles("/media/series/Show", "/media/series/Show"),
		).toBe(false);
		expect(
			shouldMoveProviderFiles("/media/series/Old", "/media/series/New"),
		).toBe(true);
	});

	it("dedupes tag ids and creates missing freeform tags once", async () => {
		const api = {
			getTags: vi.fn(async () => [{ id: tagId(1), label: "Existing" }]),
			createTag: vi.fn(
				async (
					_credentials: { url: string; apiKey: string },
					label: string,
				) => ({ id: tagId(2), label }),
			),
		};

		const credentials = { url: "https://example.test", apiKey: "secret" };

		const ids = await resolveMutationTagIds(
			api,
			credentials,
			[tagId(1), tagId(3)],
			[" existing ", "New", "new"],
			"sonarr",
		);

		expect(ids).toEqual([1, 3, 2]);
		expect(api.getTags).toHaveBeenCalledTimes(1);
		expect(api.createTag).toHaveBeenCalledTimes(1);
		expect(api.createTag).toHaveBeenCalledWith(credentials, "New");
	});
});
