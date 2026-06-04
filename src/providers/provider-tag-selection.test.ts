/** Focused tests for provider tag mapping helpers. */
// src/providers/provider-tag-selection.test.ts

import { describe, expect, it } from "vitest";
import type { ProviderTagId } from "@/providers/schemas";
import {
	buildProviderTagMaps,
	splitProviderTagLabels,
} from "./provider-tag-selection";

const parseProviderTagId = (value: number) => value as ProviderTagId;

describe("provider tag selection", () => {
	it("splits mixed existing and freeform labels with case-insensitive dedupe", () => {
		const maps = buildProviderTagMaps([
			{ id: parseProviderTagId(7), label: "Keep" },
			{ id: parseProviderTagId(8), label: "Seasonal" },
		]);

		expect(
			splitProviderTagLabels(
				["keep", "test1", "KEEP", "Seasonal", "test1", "test2"],
				maps.lookupKeyToId,
			),
		).toEqual({
			tagIds: [parseProviderTagId(7), parseProviderTagId(8)],
			freeformTags: ["test1", "test2"],
		});

		expect(splitProviderTagLabels([], maps.lookupKeyToId)).toEqual({
			tagIds: [],
			freeformTags: [],
		});
	});
});
