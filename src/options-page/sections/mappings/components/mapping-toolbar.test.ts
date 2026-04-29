/** Tests for mapping toolbar scope filters and entry-kind sets. */
// src/options-page/sections/mappings/components/mapping-toolbar.test.ts

import { describe, expect, it } from "vitest";
import {
	ALL_MAPPING_ENTRY_KINDS,
	getScopeEntryKindFilters,
} from "./mapping-toolbar";

describe("mapping toolbar scopes", () => {
	it("keeps suppressed scope limited to rejected and ignored", () => {
		expect([...getScopeEntryKindFilters("suppressed")].toSorted()).toEqual([
			"ignored",
			"rejected",
		]);
	});

	it("keeps needs-attention scope on derived attention kinds", () => {
		expect([...getScopeEntryKindFilters("needs-attention")].toSorted()).toEqual(
			["ignored", "manual", "rejected", "unknown", "unmapped"],
		);
		expect(ALL_MAPPING_ENTRY_KINDS).toEqual([
			"manual",
			"unmapped",
			"unknown",
			"rejected",
			"ignored",
			"auto",
			"upstream",
		]);
	});
});
