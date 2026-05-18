/** Tests for browse-card overlay primary-button state priority. */
// src/features/media-overlay/card-overlay-state.test.ts

import { describe, expect, it } from "vitest";
import { getCardOverlayPrimaryStatus } from "./card-overlay-state";

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

describe("getCardOverlayPrimaryStatus", () => {
	it("uses the overlay priority order for conflicting states", () => {
		expect(
			getCardOverlayPrimaryStatus({
				...baseInput,
				isConfigured: false,
				isChecking: true,
			}).action,
		).toBe("configure");

		expect(
			getCardOverlayPrimaryStatus({
				...baseInput,
				isChecking: true,
				isAdding: true,
			}).state,
		).toBe("checking");

		expect(
			getCardOverlayPrimaryStatus({
				...baseInput,
				hasAddError: true,
				hasStatusError: true,
			}).action,
		).toBe("retry-add");

		expect(
			getCardOverlayPrimaryStatus({
				...baseInput,
				providerMappingState: "unknown",
				isInLibrary: true,
			}).state,
		).toBe("in-library");
	});

	it("opens mapping for unmapped or unknown status and quick-adds mapped missing media", () => {
		expect(
			getCardOverlayPrimaryStatus({
				...baseInput,
				providerMappingState: "unmapped",
				hasProviderId: false,
			}).action,
		).toBe("open-mapping");

		expect(
			getCardOverlayPrimaryStatus({
				...baseInput,
				providerMappingState: "unknown",
				hasProviderId: false,
			}).action,
		).toBe("open-mapping");

		expect(getCardOverlayPrimaryStatus(baseInput).action).toBe("quick-add");
	});
});
