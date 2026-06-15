/** Tests for shared Seerr request and library action state labels. */
// src/features/seerr-request/seerr-action-state.test.ts

import { describe, expect, it } from "vitest";
import { getSeerrActionState } from "./seerr-action-state";

const baseInput = {
	isConfigured: true,
	isRequesting: false,
	isChecking: false,
	requestSucceeded: false,
	requestFailed: false,
	status: undefined,
};

describe("getSeerrActionState", () => {
	it("uses library wording for available media", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "available",
			}),
		).toMatchObject({
			label: "In Seerr library",
			disabled: true,
			settled: true,
		});
	});

	it("uses partial library wording for partially available media", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "partial",
			}).label,
		).toBe("Partially in Seerr library");
	});

	it("uses request wording for pending and processing media", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "pending",
			}).label,
		).toBe("Requested in Seerr");

		expect(
			getSeerrActionState({
				...baseInput,
				status: "processing",
			}).label,
		).toBe("Requested in Seerr");
	});

	it("treats enabled status without data as checking", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				isChecking: true,
			}),
		).toMatchObject({
			state: "checking",
			label: "Checking Seerr...",
			disabled: true,
			settled: false,
		});
	});

	it("keeps requestable state for unknown status and failed status checks", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "unknown",
			}),
		).toMatchObject({
			label: "Request in Seerr",
			disabled: false,
		});

		expect(
			getSeerrActionState({
				...baseInput,
				requestFailed: true,
			}),
		).toMatchObject({
			label: "Retry Seerr request",
			disabled: false,
		});
	});

	it("allows deleted media to be requested again", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "deleted",
			}),
		).toMatchObject({
			label: "Request again in Seerr",
			disabled: false,
			settled: false,
		});
	});

	it("blocks media that Seerr reports as deleted or blocked under code 6", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "deleted-or-blocked",
			}),
		).toMatchObject({
			state: "error",
			label: "Unavailable in Seerr",
			disabled: true,
			settled: true,
		});
	});
});
