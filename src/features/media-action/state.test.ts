/** Tests for shared media-action status priority and primary command selection. */
// src/features/media-action/state.test.ts

import { describe, expect, it } from "vitest";
import { getMediaActionStatus } from "./state";

const baseInput = {
	isConfigured: true,
	isChecking: false,
	isAdding: false,
	hasAddError: false,
	hasStatusError: false,
	addSucceeded: false,
	providerMappingState: "mapped" as const,
	isInLibrary: false,
	hasProviderId: true,
	canQuickAdd: true,
};

describe("getMediaActionStatus", () => {
	it("uses the shared priority order for conflicting states", () => {
		expect(
			getMediaActionStatus({
				...baseInput,
				isConfigured: false,
				isChecking: true,
			}).state,
		).toBe("checking");

		expect(
			getMediaActionStatus({
				...baseInput,
				isConfigured: false,
			}).action,
		).toBe("configure");

		expect(
			getMediaActionStatus({
				...baseInput,
				isChecking: true,
				isAdding: true,
			}).state,
		).toBe("checking");

		expect(
			getMediaActionStatus({
				...baseInput,
				hasAddError: true,
				hasStatusError: true,
			}).action,
		).toBe("retry-add");

		expect(
			getMediaActionStatus({
				...baseInput,
				providerMappingState: "unknown",
				isInLibrary: true,
			}).state,
		).toBe("in-library");
	});

	it("opens mapping for unmapped or unknown status and quick-adds mapped missing media", () => {
		expect(
			getMediaActionStatus({
				...baseInput,
				providerMappingState: "unmapped",
				hasProviderId: false,
			}).action,
		).toBe("open-mapping");

		expect(
			getMediaActionStatus({
				...baseInput,
				providerMappingState: "unknown",
				hasProviderId: false,
			}).action,
		).toBe("open-mapping");

		expect(getMediaActionStatus(baseInput).action).toBe("quick-add");
	});
});
