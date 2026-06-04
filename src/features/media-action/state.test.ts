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
	mapping: { kind: "mapped", source: "manual", providerId: 1 } as const,
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
				mapping: { kind: "ambiguous", targets: [] },
				isInLibrary: true,
			}).state,
		).toBe("in-library");
	});

	it("opens mapping for unmapped or unknown status and quick-adds mapped missing media", () => {
		expect(
			getMediaActionStatus({
				...baseInput,
				mapping: { kind: "unmapped", hadResolveAttempt: true },
				hasProviderId: false,
			}).action,
		).toBe("open-mapping");

		expect(
			getMediaActionStatus({
				...baseInput,
				mapping: { kind: "ambiguous", targets: [] },
				hasProviderId: false,
			}).action,
		).toBe("open-mapping");

		expect(getMediaActionStatus(baseInput).action).toBe("quick-add");
	});
});
