/** Tests for provider mutation helper behavior. */
// src/providers/library/mutation-helpers.test.ts

import { describe, expect, it, vi } from "vitest";
import { parseProviderTagId } from "@/providers";
import { resolveMutationTagIds } from "./mutation-helpers";

const tagId = parseProviderTagId;

describe("provider mutation helpers", () => {
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

		const ids = await resolveMutationTagIds({
			api,
			credentials,
			existingIdsFromForm: [tagId(1), tagId(3)],
			freeformLabelsFromForm: [" existing ", "New", "new"],
			provider: "sonarr",
		});

		expect(ids).toEqual([1, 3, 2]);
		expect(api.getTags).toHaveBeenCalledTimes(1);
		expect(api.createTag).toHaveBeenCalledTimes(1);
		expect(api.createTag).toHaveBeenCalledWith(credentials, "New");
	});
});
