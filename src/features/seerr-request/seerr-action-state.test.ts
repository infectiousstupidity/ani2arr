/** Tests for shared Seerr request and library action state labels. */
// src/features/seerr-request/seerr-action-state.test.ts

import { describe, expect, it } from "vitest";
import {
	getSeerrActionState,
	getSeerrVisualStatus,
} from "./seerr-action-state";

const baseInput = {
	isConfigured: true,
	isChecking: false,
	hasUsableTarget: true,
	status: undefined,
};

describe("getSeerrActionState", () => {
	it("uses available wording for available media", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "available",
			}),
		).toMatchObject({
			label: "Available in Seerr",
			disabled: false,
		});
	});

	it("uses partial wording for partially available media", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "partial",
			}).label,
		).toBe("Partially in Seerr");
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

	it("keeps settled Seerr media actionable", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "partial",
			}),
		).toMatchObject({
			state: "in-library",
			disabled: false,
		});
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
		});
	});

	it("keeps requestable state for unknown status", () => {
		expect(
			getSeerrActionState({
				...baseInput,
				status: "unknown",
			}),
		).toMatchObject({
			label: "Request in Seerr",
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
		});
	});
});

describe("getSeerrVisualStatus", () => {
	it("lets target available win", () => {
		expect(
			getSeerrVisualStatus({ target: "available", overall: "partial" }),
		).toBe("available");
	});

	it("lets target pending win", () => {
		expect(
			getSeerrVisualStatus({ target: "pending", overall: "partial" }),
		).toBe("pending");
	});

	it("shows overall partial when the target is not requested", () => {
		expect(
			getSeerrVisualStatus({ target: "not-requested", overall: "partial" }),
		).toBe("partial");
	});
});
