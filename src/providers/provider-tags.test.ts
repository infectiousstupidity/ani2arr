/** Tag resolution skips the provider round trip when nothing new is requested. */

import { describe, expect, it, vi } from "vitest";
import { resolveProviderTagIds } from "./provider-tags";
import type { ProviderTagId } from "./schemas";

const tagId = (value: number) => value as ProviderTagId;

describe("resolveProviderTagIds", () => {
	it("does not fetch tags when there are no new labels", async () => {
		const client = { getTags: vi.fn(), createTag: vi.fn() };

		await expect(
			resolveProviderTagIds({
				provider: "sonarr",
				client,
				credentials: { url: "https://sonarr.local", apiKey: "key" },
				existingIds: [tagId(1), tagId(1), tagId(2)],
				freeformLabels: ["  "],
			}),
		).resolves.toEqual([tagId(1), tagId(2)]);
		expect(client.getTags).not.toHaveBeenCalled();
	});
});
